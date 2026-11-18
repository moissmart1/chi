// The release check's read-only key (security, 2026-11-18): only its SHA-256
// is here. The key itself is a random 32-byte value kept outside this
// repository, in the owner's private env file (CHI_CHECK_KEY). Publishing
// the hash gives nothing away. Under this key the backend answers only load,
// rev, history and migrate (Actions.js dispatch_), and its load leaves out
// the e-Transfer addresses.
var CHECK_KEY_HASH = "ccbecf5ec04b34b3b359b820664cba1dbc2b184f372fd583fb76ccba0c86b99a";
