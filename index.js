const fetch = require("node-fetch");
const request = require("request");
const sha1 = require("js-sha1");
const debug = require("debug")("wifi");
const assert = require("assert");

const routerAddress = "http://192.168.1.1/"

function baseHeaders({mifisess}) {
  const headers = {
    "accept": "application/json, text/javascript, */*; q=0.01",
    "accept-language": "en-US,en;q=0.9",
    "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
    "sec-gpc": "1",
    "x-requested-with": "XMLHttpRequest",
    "Referrer-Policy": "same-origin",
    "connection": "keep-alive",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4721.119 Safari/537.36",
    "origin": "http://192.168.1.1",
    "dnt": "1",
  };

  if(mifisess) {
    headers["cookie"] = `mifisess=${mifisess}`;
  }

  return headers;
}

function getStatus({mifisess}) {
  return fetch(`${routerAddress}srv/status/`, {
    "headers": {
      ...baseHeaders({mifisess}),
      "Referer": "${routerAddress}",
    },
    "body": null,
    "method": "GET"
  });
}

function loginRequest({mifisess}) {
  return fetch(`${routerAddress}login/`, {
    "headers": {
      ...baseHeaders({mifisess}),
      "Referer": "${routerAddress}",
    },
    "body": null,
    "method": "GET"
  });
}

function loginPost({mifisess, sectoken, password}) {
  const shaPassword = sha1(password + sectoken);
  return fetch(`${routerAddress}submitLogin/`, {
    "headers": {
      ...baseHeaders({mifisess}),
      "Referer": "${routerAddress}",
    },
    "body": `shaPassword=${shaPassword}&gSecureToken=${sectoken}`,
    "method": "POST"
  });
}

function networkSelection({mifisess, sectoken}) {
  return fetch(`${routerAddress}networkselection/`, {
    "headers": {
      ...baseHeaders({mifisess}),
      "Referer": "${routerAddress}networks/",
    },
    "body": null,
    "method": "GET"
  });
}

function getScanStatus({mifisess, sectoken}) {
  return fetch(`${routerAddress}networkselection/getscanstatus/`, {
    "headers": {
      ...baseHeaders({mifisess}),
      "Referer": "${routerAddress}networks/",
    },
    "body": null,
    "method": "GET"
  });
}

function startScan({mifisess, sectoken}) {
	return fetch(`${routerAddress}networkselection/startscan/`, {
		"headers": {
      ...baseHeaders({mifisess}),
      "Cookie": `mifisess=${mifisess}`,
			"Referer": "${routerAddress}networks/",
		},
    "body": `gSecureToken=${sectoken}`,
		"method": "POST"
	});
}

async function getSecureToken({mifisess}) {
  const loginReq = await loginRequest({mifisess});
  const html = await loginReq.text();
  const regex1 = /<input type="hidden" name="gSecureToken" value="\w+"/
  const input = regex1.exec(html)[0];
  const regex2 = /value="\w+"/
  const value = regex2.exec(input)[0].split('"')[1];
  return value;
}

function getCookies(callback){
  request(routerAddress, function (error, response, body) {
      if (!error && response.statusCode == 200) {
          return callback(null, response.headers['set-cookie']);
      } else {
          return callback(error);
      }
  })
}

function getMifisess() {
  return new Promise((resolve, reject) => {
    getCookies((err, cookies) => {
      err && reject(err);
      resolve(cookies[0].split(";")[0].replace("mifisess=",""));
    });
  });
}

(async () => {
  const mifisess = await getMifisess();
  debug({mifisess});
  const sectoken = await getSecureToken({mifisess});
  assert(process.env.PASSWORD, "password is required: PASSWORD=xxxxxxxxxxx");
  if (!(mifisess && sectoken)) throw "Could not obtain mifisess and sectoken";
  const loginRes = await loginPost({
    password: process.env.PASSWORD,
    mifisess,
    sectoken
  });
  debug({loginRes: await loginRes.text()});
  const networkSelectionRes = await networkSelection({mifisess});
  debug(await networkSelectionRes.text());
  const getScanStatusRes = await getScanStatus({mifisess});
  const scanStatus = await getScanStatusRes.text();
  debug(scanStatus.status);
  const scanStatusObj = JSON.parse(scanStatus);
  const newToken = scanStatusObj.gSecureToken;
  debug(newToken);
  if (!newToken) throw "Could not obtain newtoken";
  const statusRes = await getStatus({mifisess});
  debug({statusRes: await statusRes.text()});
  const scanRes = await startScan({    
		mifisess,
		sectoken: newToken,
	});
	debug({scanRes: await scanRes.text()});
  const statusInterval = setInterval(async () => {
      const getScanStatusRes = await getScanStatus({mifisess});
      const scanStatus = await getScanStatusRes.text();
      debug(scanStatus);
      if (scanStatus.includes("Scan complete")) {
        clearInterval(statusInterval);
      }
  }, 2000);
})();
