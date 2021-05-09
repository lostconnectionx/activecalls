const config = require('./config');
const net = require('./net');

async function getAddress(c) {
    try {
        let address = c['location'];
        let ll;
        let street;
        let fullStreet;
        let neighborhood;

        // we'll sanitize this below
        street = address;

        // get LL
        let res = getLL(address);
        if (res) {
            ll = res['ll'];
            street = res['street'];
        }
        // sanitize street address
        street = sanitizeStreet(street);
        // fix city & state
        res = getFullStreet(address, street);
        if (res) {
            fullStreet = res['fullStreet'];
            street = res['street'];
        } else {
            fullStreet = address;
        }
        // get full street address from google
        let x;
        if (ll) {
            x = await getCorrectFullStreet(ll, 'll');
            if (!x) {
                x = await getCorrectFullStreet(fullStreet);
            }
        } else {
            x = await getCorrectFullStreet(fullStreet);
        }
        if (x) {
            fullStreet = x['fullStreet'];
            ll = x['ll'];
            neighborhood = x['neighborhood'];
            return {fullStreet: fullStreet, street: street, ll: ll, neighborhood: neighborhood};
        } else {
            return false;
        }
    }
    catch(err) {
        console.log(err);
    }
}

async function getCorrectFullStreet(fullStreet, type = 'street') {
    let neighborhood;
    let found = false;
    try {
        let url = `https://maps.googleapis.com/maps/api/geocode/json?address=${fullStreet}&key=${config.getGoogleApiKey()}`;
        let res = await net.fetchHttpsJson(url);
        let json = res['results'];
        // loop through each result
        for (let i = 0; i < json.length; i++) {
            let resultObj = json[i];
            // work on each address_component obj
            for (let j = 0; j < resultObj['address_components'].length; j++) {
                // work on the types field of each address_component object
                let typesObj = resultObj['address_components'][j]['types'];
                // loop through each type
                for (let k = 0; k < typesObj.length; k++) {
                    // found neighborhood type
                    if (typesObj[k] === 'neighborhood') {
                        neighborhood = resultObj['address_components'][j]['short_name'];
                    }
                    // found richmond locality
                    if ((typesObj[k] === 'locality') && (resultObj['address_components'][j]['short_name'] === 'Richmond')) {
                        found = true;
                    } else if ((typesObj[k] === 'administrative_area_level_2') && ((resultObj['address_components'][j]['short_name'] === 'Henrico County') ||
                        ((typesObj[k] === 'locality') && (resultObj['address_components'][j]['short_name'] === 'Henrico')))) {
                        found = true;
                    } else if ((typesObj[k] === 'administrative_area_level_2') && ((resultObj['address_components'][j]['short_name'] === 'Chesterfield County') ||
                        ((typesObj[k] === 'locality') && (resultObj['address_components'][j]['short_name'] === 'Chesterfield')))) {
                        found = true;
                    }
                }
                if (found) {
                    if (typeof neighborhood === 'undefined') {
                        neighborhood = false;
                    }
                    return {
                        fullStreet: resultObj['formatted_address'],
                        ll: `${Math.round(resultObj['geometry']['location']['lat']*1000000)/1000000},${Math.round(resultObj['geometry']['location']['lng']*1000000)/1000000}`,
                        neighborhood: neighborhood
                    };
                }
            }
        }
        if (!found && type === 'll') {
            console.log(`LL ${fullStreet} is outside of geographic area`);
        } else if (!found) {
            console.log(`Could not resolve '${fullStreet}' from Google`);
            console.log(json)
            console.log(json['address_components']);
        }
        return false;
    } catch(err) {
        console.log(err);
        console.log('Failed to geocode');
        return false;
    }
}

function getFullStreet(address, street) {
    // fix city & state
    // E FRANKLIN ST/N 8TH ST RICH
    // SCHOOL ST/CHAMBERLAYNE PKWY RICH
    try {
        let fullStreet;
        if (typeof street === 'undefined') {
            street = address;
        }
        if (street.substr(street.length - 5, street.length) === ' RICH') {
            street = street.substr(0, street.length - 5);
            fullStreet = `${street}, Richmond VA`;
        } else if (street.substr(street.length - 5, street.length) === ' HENR') {
            street = street.substr(0, street.length - 5);
            fullStreet = `${street}, Henrico VA`;
        } else if (street.substr(street.length - 5, street.length) === ' CHES') {
            street = street.substr(0, street.length - 5);
            fullStreet = `${street}, Chesterfield VA`;
        } else {
            fullStreet = `${street}, Richmond VA`;
        }
        return {fullStreet: fullStreet, street: street}
    } catch(err) {
        console.log(`Failed to parse address: ${address} `);
        console.log(err);
        return false;
    }
}

function getLL(address) {
    // if there's latitude and longitude then use it
    // LL(-77:26:36.1145,37:33:48.6436): LABURNUM/WOODLEY
    // LL(-77:23:59.1750,37:32:37.2312): CRIEGH/NINE MIL
    //  LL(-77:26:24.5481,37:33:39.9133): @BROOKFIELD
    // grab -32 LL(-77:28:56.0907,37:32:03.7332)
    let regex = /LL\(-.*(\d\d*\))/gm;
    let ll = address.match(regex);
    let street = address;
    if (ll && ll.length > 0) {
        ll = address.match(regex)[0];
        // reformat to proper latitude,longtitude
        regex = /(-?\d\d*)/gm;
        let numbersArray = ll.match(regex);
        let latitude = `${numbersArray[4]}.${numbersArray[5]}${numbersArray[6]}${numbersArray[7]}`;
        let longitude = `${numbersArray[0]}.${numbersArray[1]}${numbersArray[2]}${numbersArray[3]}`;
        ll = `${latitude},${longitude}`;
        // grab ": BELV/SPRING"
        regex = /: (?=.*)(.*)/gm;
        street = address.match(regex)[0];
        return {ll: ll, street: street};
    }
    return false;
}

function sanitizeStreet(street) {
    // remove : @ from  LL(-77:26:24.5481,37:33:39.9133): @BROOKFIELD
    if (street.substr(0,3) === ': @') {
        street = street.substr(2, street.length);
    }
    // remove the EST from street EST 2308 FAIRFIELD AVE RICH
    if (street.substr(0, 5) === ': EST') {
        street = street.substr(6, street.length);
    }
    // remove the RICH:  from RICH: @EXIT 69 - I95 NB (BELLS RD)
    if (street.substr(0, 6) === 'RICH :') {
        street = street.substr(7, street.length);
    }
    // remove @ from @EXIT 69 - I95 NB (BELLS RD)
    if (street.substr(0,1) === '@') {
        street = street.substr(1, street.length);
    }
    return street;
}

exports.getAddress = getAddress;
exports.getCorrectFullStreet = getCorrectFullStreet;
exports.getFullStreet = getFullStreet;
exports.getLL = getLL;