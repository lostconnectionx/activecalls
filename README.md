# README | activecalls

This is a Node.JS application programmed to scrape API end points for public safety active call data and upload the data to various services.

## Table of Contents

- [Installation](#installation)
- [Usage](#usage)
- [Support](#support)
- [Contributing](#contributing)

## Installation

Make sure Node.Js is installed first ([see here for instructions](https://nodejs.dev/learn/how-to-install-nodejs)).

```sh
git clone https://github.com/thepeoplerva/activecalls.git
cd activecalls
npm install
sudo npm install -g nodemon
```

## Usage

Production
```sh
npm start
```

Development
```
npm run devRun
```

Edit the `config.js` file to add:

- Twitter Application API Keys
- Google Cloud Storage Bucket Name
- Google Cloud Storage Key File
- Google Maps API Key

Note: If the Twitter User OAUTH API Keys are left blank then they can retrieved by following the HTTP localhost link printed on the console during execution (when ran from the local machine).


## Support

Please [open an issue](https://github.com/thepeoplerva/activecalls/issues/new) for support.

## Contributing

Please contribute using [Github Flow](https://guides.github.com/introduction/flow/). Create a branch, add commits, and [open a pull request](https://github.com/thepeoplerva/activecalls/compare/).
