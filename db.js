const config = require('./config');
const {Storage} = require('@google-cloud/storage');
const bucketName = config.googleBucketName;
const storage = new Storage({keyFilename: config.googleKeyFile});
const {Firestore} = require('@google-cloud/firestore');
const firestore = new Firestore({keyFilename: config.googleKeyFile});
const utils = require('./utils');

let storedCalls = [];

async function cleanStoredCalls(calls) {
    try {
        // check for storedCalls no longer active
        for (let i = storedCalls.length - 1; i >= 0; i--) {
            if (typeof storedCalls[i] === 'undefined') {
                delete storedCalls[i];
                continue;
            }
            const hash = storedCalls[i]['hash'];
            let match = false;
            for (let j = calls.length - 1; j >= 0; j--) {
                // call is still active
                if (calls[j]['hash'] === storedCalls[i]['hash']) {
                    match = true;
                }
            }
            // no match found, timeEnded === false, syncedData === true
            if (!match && !storedCalls[i]['timeEnded'] && storedCalls[i]['syncedData']) {
                await updateCall(i, storedCalls[i]['hash'], 'timeEnded', Date.now());
            }
            // no match found and syncedData === true
            if (!match && storedCalls[i]['syncedData']) {
                await moveColdCall(hash);
                await deleteCall(hash);
            }
        }
    } catch (err) {
        console.log(err);
    }
}

async function deleteCall(hash) {
    return new Promise(async (resolve, reject) => {
        for (let i = storedCalls.length - 1; i >= 0; i--) {
            if (storedCalls[i]['hash'] === hash) {
                resolve(storedCalls.splice(i, 1));
            }
        }
        reject();
    }).catch(console.err);
}

async function downloadCalls() {
    let res = await firestore.collection('activecalls').get();
    res.docs.forEach((doc) => {
        let temp = doc.data();
        temp['syncedData'] = true;
        pushStoredCall(temp);
    })
    console.log(`Initialized ${storedCalls.length} stored active calls.`);
    return res;
}

async function fetchStorageData(path, filename) {
    return new Promise(async (resolve, reject) => {
        let file = storage.bucket(bucketName).file(`${path}/${filename}`);
        await file.download(function (err, contents) {
            if (!err) {
                resolve(contents);
            } else {
                console.log("Error in fetchStorageData(): " + err);
                return false;
            }
        });
    }).catch(console.err);
}

function getStoredCalls() {
    return storedCalls;
}

async function moveColdCall(hash) {
    try {
        let activeCall = firestore.doc(`activecalls/${hash}`);
        let doc = await activeCall.get();
        utils.printCallStatus('ENDED.', doc.data());
        await saveCall(doc.data(), 'coldcalls');
        await activeCall.delete();
    } catch (err) {
        console.log("Error in dbMoveColdCall(): " + err);
    }
}

function pushStoredCall(call) {
    storedCalls.push(call);
}

async function saveCall(c, path = 'activecalls') {
    let temp = Object.assign({}, c);
    try {
        const document = firestore.doc(`${path}/${c['hash']}`);
        delete temp['b64'];
        delete temp['syncedData'];
        c['syncedData'] = true;
        pushStoredCall(c);
        return await document.set(temp);
    } catch (err) {
        console.log("Error in dbSaveCall(): " + err);
        c['syncedData'] = false;
        pushStoredCall(c);
        return false;
    }
}

async function saveImage(c) {
    const file = storage.bucket(bucketName).file(`tweet_maps/${c['hash']}.png`);
    await file.exists(async (err, exists) => {
        if (exists) {
            return;
        } else if (!c['b64']) {
            return false;
        } else {
            await file.save(Buffer.from(c['b64'], 'base64'), async (err) => {
                if (err) {
                    console.log("Error in saveImage(): " + err);
                    return false;
                } else {
                    c['syncedImage'] = true;
                    await updateCall(c, c['hash'], 'syncedImage', true);
                }
            }).catch((err) => {
                console.log("Error in saveImage(): " + err);
                return false;
            });
        }
    });
}

async function updateCall(c, hash, key, value) {
    if (key === 'b64' || key === 'syncedData') {
        return;
    }
    try {
        const document = firestore.doc(`activecalls/${hash}`);
        let res = await document.update({
            [key]: value,
        });
        if (res) {
            c['syncedData'] = true;
            c[key] = value;
        }
        return res;
    } catch (err) {
        console.log("Error in dbUpdateCall(): " + err);
        c['syncedData'] = false;
        return false;
    }
}

async function updateStoredCall(i, hash, key, value) {
    storedCalls[i][key] = value;
    try {
        let res = await updateCall(storedCalls[i], hash, key, value);
        if (res) {
            storedCalls[i]['syncedData'] = true;
        } else {
            storedCalls[i]['syncedData'] = false;
        }
    } catch(err) {
        console.log("Error in updateStoredCall(): " + err);
        storedCalls[i]['syncedData'] = false;
        return false;
    }
}

exports.cleanStoredCalls = cleanStoredCalls;
exports.deleteCall = deleteCall;
exports.downloadCalls = downloadCalls;
exports.fetchStorageData = fetchStorageData;
exports.getStoredCalls = getStoredCalls;
exports.moveColdCall = moveColdCall;
exports.pushStoredCall = pushStoredCall;
exports.saveCall = saveCall;
exports.saveImage = saveImage;
exports.updateCall = updateCall;
exports.updateStoredCall = updateStoredCall;