// twitter user oauth keys
const oauthTokens = {
    accessKey: '',
    accessSecret: ''
}

// twitter application api keys
const appTokens = {
    consumerKey: '',
    consumerSecret: ''
}

// google cloud storage bucket name
let googleBucketName = '';

// google key file
let googleKeyFile = '';

// google maps api keys
let googleApiKeys = [''];
// googleApiKeys.push('ENTER_OPTIONAL_SECONDARY_KEY_HERE');
// googleApiKeys.push('ENTER_OPTIONAL_TERTIARY_KEY_HERE');

// discord webhook
let discordWebHook = '';

// DO NOT EDIT BELOW THIS LINE

if (googleBucketName.length === 0 || googleKeyFile.length === 0 || googleApiKeys[0].length === 0) {
    console.log('Missing Google API keys in config.js');
    process.exit();
}

if (appTokens['consumerKey'].length === 0 || appTokens['consumerSecret'].length === 0) {
    console.log('Missing Twitter Application API keys in config.js');
    process.exit();
}

if (discordWebHook.length === 0) {
    console.log('Missing Discord Webhook in config.js');
    process.exit();
}
let googleApiKeyCounter = 0;

function getGoogleApiKey() {
    let key = googleApiKeys[googleApiKeyCounter];
    googleApiKeyCounter++;
    if (googleApiKeyCounter >= googleApiKeys.length) {
        googleApiKeyCounter = 0;
    }
    return key;
}

exports.appTokens = appTokens;
exports.discordWebHook = discordWebHook;
exports.getGoogleApiKey = getGoogleApiKey;
exports.googleBucketName = googleBucketName;
exports.googleKeyFile = googleKeyFile;
exports.oauthTokens = oauthTokens;