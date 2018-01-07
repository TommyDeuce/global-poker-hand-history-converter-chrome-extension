import '../img/icon-128.png';
import '../img/icon-34.png';

import {convertHand} from '@mr-feek/global-poker-hand-history-converter/src/Converter';
import GlobalPokerHand from '@mr-feek/global-poker-hand-history-converter/src/GlobalPokerHand';
import {getParams} from './utils';

const DEFAULT_START_TIME = 1515047737811; // LatestHandStartTime

let session;
let playerId;

chrome.webRequest.onBeforeSendHeaders.addListener(details => {
    // Save these so that we can reuse them when issuing our own XHR
    const params = getParams(details.url);
    session = params.session;
    playerId = params.playerId;
}, {urls: ['https://public.globalpoker.com/player-api/rest/player/handhistory/*']});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'hc.convertHands') {
        fetchAndConvertHands(
            request.options.handsToFetch,
            (data) => {
                sendResponse({success: true, data: data});
            },
            (data) => {
                sendResponse({success: false, data: data});
            }
        );
    }

    return true;
});

function fetchAndConvertHands(numberOfHandsToFetch, success, failure) {
    const successCallback = success;
    const failureCallback = failure;

    getHands(session, playerId, [], numberOfHandsToFetch, hands => {
        console.log('hands finished being fetched. now converting to pokerstars format');
        const converted = hands.map(handHistoryBlob => {
            return convertHand(new GlobalPokerHand(handHistoryBlob));
        });

        const blob = new Blob([converted.join('\n\n\n')], {type: 'text/plain'});
        const dataUrl = URL.createObjectURL(blob);
        chrome.downloads.download({url: dataUrl});
        successCallback();
    });
}

function getHands(session, playerId, hands, numberOfHandsToFetch, done) {
    if (hands.length >= numberOfHandsToFetch) {
        return done(hands);
    }

    const count = 50;
    const lastHand = hands[hands.length - 1];

    const startTime = lastHand ? lastHand.startTime - 1 : DEFAULT_START_TIME;

    const xhr = new XMLHttpRequest();
    const url = `https://play.globalpoker.com/player-api/rest/player/handhistory/XSD?count=${count}&startTime=${startTime}&descending=true&session=${session}&playerId=${playerId}&r=${Math.random()}`;

    xhr.open('GET', url, true);

    xhr.onload = function () {
        const data = JSON.parse(xhr.response);

        if (!data || !data.hands || data.hands.length === 0) {
            return done(hands);
        }

        hands.push(...data.hands);

        return getHands(session, playerId, hands, numberOfHandsToFetch, done);
    };

    xhr.send(null);
}
