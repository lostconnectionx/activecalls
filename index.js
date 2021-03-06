const db = require('./db');
const callWorker = require('./callworker');
const net = require('./net');
const utils = require('./utils');

console.log(`Running as debug=${utils.checkDebug()}.`);

async function executeScraper() {
    return new Promise(async function(resolve, reject) {
        try {
            let calls = [];
            calls = await net.fetchRvaCalls();
            calls = await callWorker.processCSV(calls);
            await utils.wait(3000);
            await callWorker.processCalls(calls);
            await callWorker.sendQueuedTweets();
            await callWorker.sendDiscordNotifications();
            await callWorker.uploadTweetMaps();
            await db.cleanStoredCalls(calls);
            resolve();
        } catch(err) {
            console.log('Error in executeScraper(): ' + err);
            throw new Error('Error in executeScraper(): ' + err);
        }
    }).catch(err => {
        console.error(err)
    });
}

async function main() {
    net.verifyTwitterCredentials();
    await db.downloadCalls();

    while (true) {
        await executeScraper();
    }
}

if (require.main === module) {
    main();
}
