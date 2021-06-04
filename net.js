const config = require('./config');
const express = require('express');
const FormData = require('form-data');
const https = require('https');
const Twitter = require('twitter-lite');
const utils = require('./utils');

const app = express();

const defaultAgent = new https.Agent({keepAlive: true});
const insecureAgent = new https.Agent({rejectUnauthorized: false, keepAlive: true});
const rvaOptions = {
    agent: insecureAgent,
    host: 'apps.richmondgov.com',
    port: 443,
    path: '/applications/activecalls/Home/ActiveCalls',
    headers: {'User-Agent': 'thepeople.pub active calls bot'},
    timeout: 9000,
};

async function checkForStaticImage(addrQuery) {
    let url = `https://maps.googleapis.com/maps/api/streetview/metadata?location=${addrQuery}&key=${config.getGoogleApiKey()}`;
    return await fetchHttpsJson(url);
}

async function fetchHttpsBinary(url, agent = defaultAgent) {
    return new Promise(async (resolve, reject) => {
        let req = await https.get(url, {agent: agent}, res => {
            res.setEncoding('binary');
            let chunks = [];
            setTimeout(function () {
                reject('Timeout in fetchHttpsBinary()');
            }, 1000 * 60);
            res.on('data', (chunk) => {
                chunks.push(Buffer.from(chunk, 'binary'));
            });
            res.on('end', () => {
                let binary = Buffer.concat(chunks);
                resolve(binary);
            });
        });
        req.end();
        req.on('error', err => {
            console.log("Error in fetchHttpsBinary(): " + err);
            reject(err);
        });
    }).catch(console.err);
}

async function fetchHttpsJson(url, agent = defaultAgent) {
    return new Promise(async (resolve, reject) => {
        let req = https.get(url, {agent: agent}, res => {
            res.setEncoding('utf8');
            let data = '';
            setTimeout(function () {
                reject('Timeout in fetchHttpsBinary()');
            }, 1000 * 60);
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                let json = JSON.parse(data);
                if (json['status'] === 'OK') {
                    resolve(json);
                } else {
                    resolve(false);
                }
            });
        });
        req.end();
        req.on('error', err => {
            console.log("Error in fetchHttpsJson(): " + err);
            reject(err);
        });
    }).catch(console.err);
}

async function fetchMapImage(addr) {
    let addrQuery = addr.fullStreet;
    if (typeof addr.ll !== 'undefined' && addr.ll !== null) {
        addrQuery = addr.ll;
    }
    let url = `https://maps.googleapis.com/maps/api/staticmap?center=${addrQuery}&zoom=15&size=700x330&scale=2&key=${config.getGoogleApiKey()}&markers=color:red%7C${addrQuery}`;
    return await fetchHttpsBinary(url);
}

async function fetchRvaCalls() {
    return new Promise(async (resolve, reject) => {
        let req = https.get(rvaOptions, res => {
            res.setEncoding('utf8');
            let data = '';
            setTimeout(function () {
                reject('Timeout in fetchRvaCalls()');
            }, 1000 * 60);
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                resolve(data);
            });
        });
        req.end();
        req.on('error', err => {
            console.log("Error in fetchRvaCalls(): " + err);
            reject(err);
        });
    }).catch(console.err);
}

async function fetchStaticImage(addr) {
    let addrQuery = addr.fullStreet;
    let hasImage;
    if (typeof addr.ll !== 'undefined' && addr.ll !== null) {
        addrQuery = addr.ll;
        hasImage = await checkForStaticImage(addrQuery);
        if (!hasImage) {
            addrQuery = addr.fullStreet;
        }
    }
    hasImage = await checkForStaticImage(addrQuery);
    if (!hasImage) {
        return false;
    }
    let url = `https://maps.googleapis.com/maps/api/streetview?size=420x360&location=${addrQuery}&fov=95&key=${config.getGoogleApiKey()}`;
    return await fetchHttpsBinary(url);
}

function newTwitterClient(subdomain = 'api') {
    return new Twitter({
        subdomain,
        consumer_key: config.appTokens.consumerKey,
        consumer_secret: config.appTokens.consumerSecret,
        access_token_key: config.oauthTokens.accessKey,
        access_token_secret: config.oauthTokens.accessSecret
    });
}

async function postToDiscord(url, text, image) {
    return new Promise(async (resolve, reject) => {
        if (image.substring(0, 21) === 'data:image/png;base64,') {
            image = image.substring(21, image.length);
        }
        let buf = Buffer.from(image, 'base64');
        const form = new FormData();
        form.append('file', buf, { filename: 'active_call.png'});
        form.append('payload_json', JSON.stringify({
            'content': text,
            'embeds': null
        }));
        let req = https.request(url, {method: 'POST', headers: form.getHeaders(), agent: defaultAgent}, res => {
            res.setEncoding('utf8');
            let data = '';
            setTimeout(function () {
                reject('Timeout in postToDiscord()');
            }, 1000 * 60);
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                if (Math.trunc(res.statusCode / 100) === 2) {
                    resolve(true);
                } else {
                    console.log('Error in postToDiscord(): ' + res.statusCode + res.statusMessage);
                    resolve(false);
                }
            });
        });
        form.pipe(req);
        req.end();
        req.on('error', err => {
            console.log("Error in postToDiscord(): " + err);
            reject(err);
        });
    }).catch(console.err);
}

async function tweetImage(call, img) {
    return new Promise(async (resolve, reject) => {
        let uploadApi = newTwitterClient('upload');
        try {
            let uploadData;
            if (img.substring(0, 21) === 'data:image/png;base64,') {
                uploadData = img.substring(21, img.length);
            } else {
                uploadData = img;
            }
            let uploadResponse = await uploadApi.post('media/upload', {media_data: uploadData});
            resolve(uploadResponse);
        } catch (res) {
            console.log(res.error);
        }
    })
        .then(async res => {
            try {
                let uploadApi = newTwitterClient('upload');
                let metaDataResponse = await uploadApi.post('media/metadata/create', {
                    media_id: res.media_id_string,
                    alt_text: {
                        text: `${call['time']}\n${call['agency']}\n${call['dispatchArea']}\n${call['location']}\n${call['callType']}`,
                    }
                });
                return res.media_id_string;
            } catch (res) {
                console.log(res.error);
            }
        }).then(async res => {
            let client = newTwitterClient();
            return await client.post('statuses/update', {status: '', media_ids: res});
        })
        .catch(console.error);
}

function verifyTwitterCredentials() {
    let client = newTwitterClient();
    client
        .get("account/verify_credentials")
        .then(results => {
            console.log('Logged in succesfully');
        })
        .catch(function () {
            app.listen(8080, () => {
                console.log(`App listening at http://localhost:8080`)
            })
            client
                .getRequestToken("http://127.0.0.1:8080/oauth/callback")
                .then(res => {
                    console.log(`Could not authenticate. Navigate to https://api.twitter.com/oauth/authenticate?oauth_token=${res.oauth_token} to login.`);
                }).catch(console.error);
            app.get('/oauth/callback', function (req, res) {
                client
                    .getAccessToken({
                        oauth_verifier: req.query.oauth_verifier,
                        oauth_token: req.query.oauth_token
                    })
                    .then(result => {
                        let resp = {
                            accessKey: result.oauth_token,
                            accessSecret: result.oauth_token_secret,
                            userId: result.user_id,
                            screenName: result.screen_name
                        }
                        console.log(resp);
                        res.send(resp);
                    }).catch(console.err);
            })
        });
}

exports.checkForStaticImage = checkForStaticImage;
exports.fetchHttpsBinary = fetchHttpsBinary;
exports.fetchHttpsJson = fetchHttpsJson;
exports.fetchMapImage = fetchMapImage;
exports.fetchRvaCalls = fetchRvaCalls;
exports.postToDiscord = postToDiscord;
exports.fetchStaticImage = fetchStaticImage;
exports.newTwitterClient = newTwitterClient;
exports.tweetImage = tweetImage;
exports.verifyTwitterCredentials = verifyTwitterCredentials;
