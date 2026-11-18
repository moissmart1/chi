// US dollars per Canadian dollar for today's Chicago date. Fetched at most
// once a day (kept in Script Properties as RATE_<YYYY-MM-DD>), to four
// decimals. A failed fetch is noted in RATE_FAIL_AT and not retried for an
// hour (see shouldFetchRate in Pure.js); meanwhile, and on any failure, the
// last good rate, or the stand-in 0.72 if there has never been one.
// getRateInfo_ also says which of those it is (rateSource in Pure.js).

// Built when asked: Apps Script loads files in no fixed order, so a file
// never reads another's names (HOME_CURRENCY_ is in Pure.js) at load time.
function rateUrl_() {
  return "https://open.er-api.com/v6/latest/" + HOME_CURRENCY_;
}
var RATE_FALLBACK_ = 0.72;
// A Canadian dollar has bought between about 0.62 and 1.06 US dollars in this
// century; anything outside these bounds is a bad answer, not a rate.
var RATE_MIN_ = 0.5;
var RATE_MAX_ = 1.0;

function rateKey_() {
  return "RATE_" + Utilities.formatDate(new Date(), TRIP_TZ_, "yyyy-MM-dd");
}

// One fetch. Stores and returns { rate } on success, or { error } saying why not.
function fetchRate_(key) {
  var error;
  try {
    var res = UrlFetchApp.fetch(rateUrl_(), { muteHttpExceptions: true });
    var code = res.getResponseCode();
    if (code === 200) {
      var got = Number(JSON.parse(res.getContentText()).rates[TRIP_CURRENCY_]);
      // Refuse an absurd figure rather than stamp it onto every expense today.
      if (isFinite(got) && got > RATE_MIN_ && got < RATE_MAX_) {
        var rate = rateRounded(got);
        setProp_(key, String(rate));
        setProp_("RATE_LAST", String(rate));
        setProp_("RATE_FAIL_AT", "");
        return { rate: rate };
      }
      error = "an unexpected rate (" + got + ")";
    } else {
      error = "HTTP " + code;
    }
  } catch (e) {
    error = String((e && e.message) || e);
  }
  setProp_("RATE_FAIL_AT", nowIso_());
  return { error: error };
}

function getRateInfo_() {
  var key = rateKey_();
  var stored = getProp_(key);
  if (Number(stored) > 0) return { rate: Number(stored), source: "live" };
  if (shouldFetchRate(stored, getProp_("RATE_FAIL_AT"), nowIso_())) {
    var got = fetchRate_(key);
    if (got.rate) return { rate: got.rate, source: "live" };
  }
  var last = getProp_("RATE_LAST");
  var source = rateSource(null, last);
  return { rate: source === "last" ? Number(last) : RATE_FALLBACK_, source: source };
}

function getRate_() {
  return getRateInfo_().rate;
}

// Run by setup(): fetches today's rate now (whatever the hourly back-off says)
// and throws a plain error if it cannot, so a host that refuses Google's
// servers is found with Mo at the keyboard, not by the trip's first line.
function requireLiveRate_() {
  var key = rateKey_();
  if (Number(getProp_(key)) > 0) return;
  var got = fetchRate_(key);
  if (got.rate) return;
  throw new Error("Couldn\u2019t fetch today\u2019s US dollar rate from open.er-api.com: " + got.error + ". The app would fall back to " + RATE_FALLBACK_ + ".");
}
