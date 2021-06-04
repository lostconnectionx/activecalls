const config = require('./config');
const db = require('./db');
const geo = require('./geo');
const hash = require('object-hash');
const images = require('./images');
const net = require('./net');
const tableToCsv = require('node-table-to-csv');
const utils = require('./utils');

async function buildStoredCall(c) {
    let address;
    address = await geo.getAddress(c);
    if (address) {
        c['address'] = address;
        c['b64'] = await images.createImage(c, address);
        c['timeAdded'] = Date.now();
        c['tweeted'] = false;
        await db.saveCall(c);
        await db.saveImage(c);
        utils.printCallStatus('QUEUED', c);
    } else {
        c['address'] = false;
        c['broken'] = true;
        c['tweeted'] = false;
        c['timeAdded'] = Date.now();
        // todo: save image
        await db.saveCall(c);
        utils.printCallStatus('BROKEN', c);
    }
}

function getDiscordText(call) {
    let addrQuery;
    if (call['address'].neighborhood) {
        addrQuery = `${utils.getNormalCase(call['address']['street'])} | ${call['address']['neighborhood']}`;
    } else {
        addrQuery = `${utils.getNormalCase(call['address']['street'])}`;
    }
    let line1 = `${call['agency']} | ${addrQuery}`;
    let line2 = utils.getNormalCase(call['callType'].replace(/(, )/, ' | ').trim());
    return `-\n${line1}\n${line2}`;
}

function getStatusRank(status) {
    switch (status) {
        case 'Dispatched':
            return 0;
        case 'Enroute':
            return 1;
        case 'Arrived':
            return 2;
    }
}

async function processCalls(calls) {
    let storedCalls = db.getStoredCalls();
    if (!calls) return false;
    for (let i = 0; i < calls.length; i++) {
        if (typeof calls[i] === 'undefined') {
            console.log('bad call detected');
        }
        let address = calls[i]['location'];
        let regex = /LL\(-.*(\d\d*\))/gm;
        let ll = address.match(regex);
        if (calls[i]['callType'] === 'HOTSPOT-CURVE, OFFICER INITATED' && (ll !== null && ll !== undefined)) {
            continue;
        } else if (calls[i]['callType'] === 'SUBJECT STOP, OFFICER-INITIATED' && (ll !== null && ll !== undefined)) {
            continue;
        } else if (calls[i]['callType'] === 'TRAFFIC STOP, OFFICER-INITIATED' && (ll !== null && ll !== undefined)) {
            continue;
        } else if (calls[i]['callType'] === 'WALKING ASSIGNMENT, OFFICER INITIATED' && (ll !== null && ll !== undefined)) {
            continue;
        }

        let found = false;
        for (let k = 0; k < storedCalls.length; k++) {
            // match found so we'll check if the status should be updated
            if ((calls[i]['hash'] === storedCalls[k]['hash']) && (getStatusRank(calls[i]['status']) <= getStatusRank(storedCalls[k]['status']))) {
                found = true;
            }
            else if ((calls[i]['hash'] === storedCalls[k]['hash']) && (getStatusRank(calls[i]['status']) > getStatusRank(storedCalls[k]['status']))) {
                // update status
                // TODO: send tweet
                found = true;
                await db.updateCall(storedCalls[k], storedCalls[k]['hash'],'status', calls[i]['status']);
                if (calls[i]['status'] === 'Enroute') {
                    await db.updateCall(storedCalls[k], storedCalls[k]['hash'], 'timeEnroute', Date.now());
                } else if (calls[i]['status'] === 'Arrived') {
                    await db.updateCall(storedCalls[k], storedCalls[k]['hash'],'timeArrived', Date.now());
                }
                utils.printCallStatus('UPDATE', calls[i]);
            }
        }
        if ((!found && typeof calls[i] !== 'undefined') && (!calls[i]['tweeted'] && !calls[i]['timeAdded'])) {
            if (calls[i]['status'] === 'Dispatched') {
                calls[i]['timeDispatched'] = Date.now();
            } else if (calls[i]['status'] === 'Enroute') {
                calls[i]['timeEnroute'] = Date.now();
            } else if (calls[i]['status'] === 'Arrived') {
                calls[i]['timeArrived'] = Date.now();
            }
            await buildStoredCall(calls[i]);
        } else {
            continue;
        }
    }
}

async function processCSV(data) {
    return new Promise(async (resolve, reject) => {
        let temp = [];
        let htmlTable = data.toString();
        let csv = tableToCsv(htmlTable).split('\n');
        csv.forEach(line => {
            if (line && line.length > 1) {
                let callArray = [];
                let lineSanitized = line.split(/(",")/);
                lineSanitized.forEach(element => {
                    let el = element.replace(/","/g, '').replace('"', '').trim();
                    if (el.length > 0) {
                        callArray.push(el);
                    }
                });
                let callObject;
                try {
                    callObject = {
                        time: callArray[0].trim(),
                        agency: callArray[1].trim(),
                        dispatchArea: callArray[2].trim(),
                        unit: callArray[3].trim(),
                        callType: callArray[4].replace(/( ,)/, ',').trim(),
                        location: callArray[5].trim(),
                        status: callArray[6].trim(),
                        timeDispatched: false,
                        timeEnroute: false,
                        timeArrived: false,
                        timeEnded: false,
                        b64: false,
                        timeAdded: false,
                        address: {},
                        broken: false,
                        tweeted: false,
                        sentDiscord: false,
                        syncedData: false,
                        syncedImage: false,
                    };
                    callObject.hash = hash(callObject, { excludeKeys: function(key) {
                            if (key !== 'time' && key !== 'agency' && key !== 'dispatchArea' && key !== 'callType') {
                                return true;
                            }
                            return false;
                        }
                    });
                    // remove alias from location
                    if (callObject['location'].split(/(: alias)/).length > 1) {
                        callObject['location'] = callObject['location'].split(/(: alias)/)[0];
                    }
                    if (typeof callObject['hash'] !== 'undefined') {
                        temp.push(callObject);
                    }
                }
                catch(err) {
                    if (callArray[0] !== 'Time Received,Agency,Dispatch Area,Unit,Call Type,Location,Status') {
                        console.log('Failed to parse callArray');
                        console.log(err);
                    }
                }
            }
        });
        resolve(temp);
    }).then(async function(cArray) {
        return(cArray);
    }).catch(console.error);
}

async function sendQueuedTweets() {
    let storedCalls = db.getStoredCalls();
    for (let i = 0; i < storedCalls.length; i++) {
        if (storedCalls[i]['tweeted'] || storedCalls[i]['broken']) {
            continue;
        } else if (!storedCalls[i]['tweeted'] && storedCalls[i]['syncedImage'] && !storedCalls[i]['b64']) {
            let res = await db.fetchStorageData('tweet_maps', `${storedCalls[i]['hash']}.png`);
            if (res) {
                storedCalls[i]['b64'] = res.toString('base64');
            }
        }
        if ((storedCalls[i]['b64']) && (storedCalls[i]['timeAdded'] + 18 * 1000 < Date.now())) {
            let res = await net.tweetImage(storedCalls[i], storedCalls[i]['b64']);
            if (res) {
                utils.printCallStatus('TWITTR', storedCalls[i]);
                await db.updateStoredCall(i, storedCalls[i]['hash'], 'tweeted', true);
            }
        }
    }
}

async function sendDiscordNotifications() {
    let storedCalls = db.getStoredCalls();
    for (let i = 0; i < storedCalls.length; i++) {
        if (storedCalls[i]['sentDiscord'] || storedCalls[i]['broken']) {
            continue;
        } else if (!storedCalls[i]['sentDiscord'] && storedCalls[i]['syncedImage'] && !storedCalls[i]['b64']) {
            let res = await db.fetchStorageData('tweet_maps', `${storedCalls[i]['hash']}.png`);
            if (res) {
                storedCalls[i]['b64'] = res.toString('base64');
            }
        }
        if ((storedCalls[i]['b64']) && (storedCalls[i]['timeAdded'] + 18 * 1000 < Date.now())) {
            let text = getDiscordText(storedCalls[i]);
            let res = await net.postToDiscord(config.discordWebHook, text, storedCalls[i]['b64']);
            if (res) {
                utils.printCallStatus('DISCRD', storedCalls[i]);
                await db.updateStoredCall(i, storedCalls[i]['hash'], 'sentDiscord', true);
            }
        }
    }
}

async function uploadTweetMaps() {
    let storedCalls = db.getStoredCalls();
    for (let i = 0; i < storedCalls.length; i++) {
        if (storedCalls[i]['syncedImage'] || storedCalls[i]['broken']) {
            continue;
        }
        if (!storedCalls[i]['b64']) {
            storedCalls[i]['b64'] = await images.createImage(storedCalls[i], storedCalls[i]['address']);
        }
        await db.saveImage(storedCalls[i]);
    }
}

exports.processCalls = processCalls;
exports.processCSV = processCSV;
exports.sendDiscordNotifications = sendDiscordNotifications;
exports.sendQueuedTweets = sendQueuedTweets;
exports.uploadTweetMaps = uploadTweetMaps;