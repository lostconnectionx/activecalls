const fs = require('fs').promises;
const minimist = require('minimist');
const titleCase = require('title-case');

const args = minimist(process.argv.slice(2), {
    alias: {
        d: 'debug',
        p: 'port'
    },
    default: {
        d: true,
        p: 8080
    }
});

function checkDebug() {
    return args.debug;
}

function getFilePrefix() {
    return (args.debug ? 'debug_' : 'prod_');
}

function getNormalCase(string) {
    if (typeof 'string' !== 'string') {
        console.log('Error in getNormalCase(): ' + string);
        return false;
    }
    string = string.toLowerCase();
    return titleCase.titleCase(string);
}

function printCallStatus(text, call) {
    console.log(`${text} | ${call['hash'].substr(0,6)} | ${call['time']} | ${call['agency']} | ${call['dispatchArea']} | ${call['callType']} | ${call['location']} | ${call['status']}`)
}

async function wait(ms) {
    return new Promise(resolve => {
        setTimeout(resolve, ms);
    });
}

async function writeBinaryFile(binary, filename) {
    await fs.writeFile(`/tmp/${getFilePrefix()}${filename}`, binary, {encoding: 'binary'});
}

exports.checkDebug = checkDebug;
exports.getFilePrefix = getFilePrefix;
exports.printCallStatus = printCallStatus;
exports.getNormalCase = getNormalCase;
exports.wait = wait;
exports.writeBinaryFile = writeBinaryFile;