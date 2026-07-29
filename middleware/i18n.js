// Returns FR or EN based on X-Lang request header (defaults to FR if absent)
function be(req, fr, en) {
  return req.headers['x-lang'] === 'en' ? en : fr;
}

module.exports = { be };
