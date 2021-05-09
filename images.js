const imageminPngquant = require('imagemin-pngquant');
const jimp = require('jimp');
const net = require('./net');
const text2png = require('text2png');

async function getTextOverlay1(call, addr) {
    try {
        let addrQuery;
        if (addr.neighborhood) {
            addrQuery = `${addr.street}\n${addr.neighborhood}`;
        } else {
            addrQuery = `${addr.street}\n${addr.ll}`;
        }
        const text1 = await jimp.read(text2png(`${call['time']}\n${call['agency']}\n${call['dispatchArea']}\n${addrQuery}`,
            {
                color: 'black',
                backgroundColor: 'white',
                lineSpacing: 5,
                padding: 3,
                font: '40px Menlo',
                localFontPath: __dirname + '/fonts/custom_font.ttf',
                localFontName: 'Menlo'
            }));
        return text1;
    } catch(err) {
        console.log("Error in getTextOverlay1(): " + err);
        throw 'Failed at getTextOverlay1()';
    }
}
async function getTextOverlay2(call) {
    try {
        let caption = call['callType'].replace(/(, )/, '\n').trim();
        const text2 = await jimp.read(text2png(`${caption}`,
            {
                color: 'white',
                backgroundColor: 'black',
                lineSpacing: 7,
                padding: 3,
                font: '48px Menlo',
                localFontPath: __dirname + '/fonts/custom_font.ttf',
                localFontName: 'Menlo'
            }));
        return text2;
    } catch(err) {
        console.log("Error in getTextOverlay2(): " + err);
        throw 'Failed at getTextOverlay2()';
    }
}

async function manipulateImages(i1, i2, t1, t2) {
    try {
        let image1 = await jimp.read(i1);
        let image2;
        if (i2) {
            image2 = await jimp.read(i2);
        }
        if (i2) {
            image2.crop(0, 0, 360, 250);
        }
        image1.composite(t1, 40, 20);
        image1.composite(t2, 40, 500);
        if (i2) {
            image1.composite(image2, 880, 20);
        }
        let buf = await image1.getBufferAsync(jimp.MIME_PNG);
        let compBuf = await imageminPngquant()(buf);
        return compBuf.toString('base64');
    } catch(err) {
        console.log("Error in manipulateImages(): " + err);
        throw 'Failed at manipulateImages()';
    }
}

async function createImage(c, address) {
    try {
        let image1 = await net.fetchMapImage(address);
        let image2 = await net.fetchStaticImage(address);
        let text1 = await getTextOverlay1(c, address);
        let text2 = await getTextOverlay2(c);
        let finalImage = await manipulateImages(image1, image2, text1, text2);
        return finalImage;
    } catch (err) {
        console.log("Error in createImage(): " + err);
        return false;
    }
}

exports.createImage = createImage;



