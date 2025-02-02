import init, { convert, guess } from "./sowasm.js";

async function main() {
    await init();

    const guessBox = elt('guess');
    const iformat = elt('iformat');
    const input = elt('input');
    const autoBox = elt('auto');
    const oformat = elt('oformat');
    const output = elt('output');
    const convertBt = elt('convert');
    const url = elt('url');
    const loadBt = elt('load');
    const corsproxyBox = elt('corsproxy');

    let urlSynced = false;
    let guessTimeout = null;
    let convertTimeout = null;

    addAllEventListeners();
    applyUrlParams();
    await ensureConsistency();

    /// Function definitions

    function addAllEventListeners() {
        iformat.addEventListener('change', async () => {
            // console.debug("change@iformat");
            guessBox.checked = false;
        });

        guessBox.addEventListener('change', async () => {
            // console.debug("change@guess");
            if (guessBox.checked) {
                await doGuess();
                if (autoBox.checked) {
                    await doConvert();
                }
            }
        });

        input.addEventListener('input', onInputChanged);

        url.addEventListener('input', () => {
            // console.debug("input@url");
            urlSynced= false;
            if (autoBox.checked) {
                doConvertThrottled();
            }
        });

        oformat.addEventListener('change', async () => {
            // console.debug("change@oformat");
            await doConvert();
        });

        autoBox.addEventListener('change', async () => {
            // console.debug("change@auto");
            convertBt.disabled = autoBox.checked;
            if (autoBox.checked) {
                await doConvert();
            }
        });

        convertBt.addEventListener('click', doConvert);

        url.addEventListener('input', () => {
            loadBt.disabled = (url.value.length === 0);
        });

        loadBt.addEventListener('click', doLoad);

        elt("permalink").addEventListener('click', () => {
            const urlParams = new URLSearchParams();
            if (guessBox.checked) {
                urlParams.set('guess', '');
            } else {
                urlParams.set('noguess', '');
                urlParams.set('iformat', iformat.value);
            }
            urlParams.set('oformat', oformat.value);
            if (autoBox.checked) {
                urlParams.set('auto', '');
            } else {
                urlParams.set('noauto', '');
            }
            console.log(!input.classList.contains('error'));
            console.log(!input.disabled);
            console.log(!urlSynced);
            console.log(!input.classList.contains('error') && !input.disabled && !urlSynced) ;
            if (!input.classList.contains('error') && !input.disabled && !urlSynced) {
                urlParams.set('input', input.value);
            }
            if (url.value) {
                urlParams.set('url', url.value);
            }
            if (corsproxyBox.checked) {
                urlParams.set('corsproxy', '');
            }
            const link = baseUrl();
            link.search = urlParams.toString();
            navigator.clipboard.writeText(link.toString());
        });
    }

    function applyUrlParams() {
        // apply parameters from query string
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('iformat')) {
            iformat.value = urlParams.get('iformat');
        }
        if (urlParams.has('url')) {
            url.value = urlParams.get('url');
        }
        if (urlParams.has('oformat')) {
            oformat.value = urlParams.get('oformat');
        }
        if (urlParams.has('guess')) {
            guessBox.checked = true;
        }
        if (urlParams.has('noguess')) {
            guessBox.checked = false;
        }
        if (urlParams.has('auto')) {
            autoBox.checked = true;
        }
        if (urlParams.has('noauto')) {
            autoBox.checked = false;
        }
        if (urlParams.has('input')) {
            input.value = urlParams.get('input');
        }
        if (urlParams.has('corsproxy')) {
            corsproxyBox.checked = true;
        }
    }

    /// ensure consistency of interface as loaded
    /// (based on URL params or browser-persisted state)
    async function ensureConsistency() {
        // console.debug("ensureConsistency")
        convertBt.disabled = autoBox.checked;
        loadBt.disabled = (url.value.length === 0);
        if (input.value) {
            onInputChanged();
        } else if (url.value) {
            await doLoad();
        }
    }

    function onInputChanged(synced) {
        // console.debug("onInputChanged");
        urlSynced= synced && url.value;
        if (guessBox.checked) {
            doGuessThrottled();
        }
        if (autoBox.checked) {
            doConvertThrottled();
        }
    }

    async function doGuess() {
        // console.debug("doGuess");
        clearTimeout(guessTimeout);
        const guessed = guess(input.value);
        iformat.value = guessed;
    }

    function doGuessThrottled() {
        // console.debug("doGuessThrottled");
        clearTimeout(guessTimeout);
        guessTimeout = setTimeout(doGuess, 500);
   }

    async function doConvert() {
        // console.debug("doConvert");
        clearTimeout(convertTimeout);
        output.classList.remove('error');
        try {
            output.disabled = true;
            output.value = "(parsing)";
            if (!iformat.value) {
                throw "Input format could not be guessed";
            }
            await yieldToBrowser();
            output.value = await convert(input.value, iformat.value || null, oformat.value, url.value || null);
        }
        catch (err) {
            output.classList.add('error');
            output.value = err;
        }
        finally {
            output.disabled = false;
        }
    }

    function doConvertThrottled() {
        // console.debug("doConvertThrottled");
        clearTimeout(convertTimeout);
        convertTimeout = setTimeout(doConvert, 500);
    }

    async function doLoad() {
        input.classList.remove('error');
        try {
            input.value = "(loading)";
            input.disabled = true;
            output.value = "";
            const resp = await myFetch(url.value);
            if (Math.floor(resp.status / 100) !== 2) {
                throw ("Got status " + resp.status);
            }
            const ctype = resp.headers.get("content-type");
            if (ctype) {
                iformat.value = ctype.split(";")[0];
                // iformat.value will be empty if the ctyp is unknown
                guessBox.checked = (!iformat.value);
            }
            input.value = await resp.text();
            onInputChanged(true);
        }
        catch(err) {
            input.classList.add('error');
            input.value = err;
        }
        finally {
            input.disabled = false;
        }
    }

    async function myFetch(url, options) {
        options = options || {};
        if (!options.headers) {
            options.headers = {};
        }
        if (!options.headers.accept) {
            options.headers.accept = "application/n-triples,application/n-quads,text/turtle,application/trig,application/ld+json,application/rdf+xml";
        }
        if (corsproxyBox.checked) {
            url = "https://corsproxy.io/?" + encodeURIComponent(url);
            // corsproxy.io seems to request HTML when the user-agent is a browser
            options.headers['user-agent'] = baseUrl();
        }
        return await fetch(url, options);
    }
}

function elt(id) {
    return document.getElementById(id);
}

/// Used solely to yield back control to the browser before continuing
async function yieldToBrowser() {
    return new Promise(function(resolve) {
        setTimeout(resolve, 0);
    });
}

function baseUrl() {
    let url = new URL(window.location);
    url.search = "";
    url.hash = "";
    return url;
}

main();
