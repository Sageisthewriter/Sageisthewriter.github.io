// See contact-worker/README.md for deployment and configuration steps.
// Set contactEndpoint to the deployed Worker's URL followed by /contact.
// The Discord webhook URL and Turnstile secret belong only in the Worker.
window.SAGE_CONFIG = {
  contactEndpoint: '',
  // Optional: keep empty when the Worker has REQUIRE_TURNSTILE=false.
  turnstileSiteKey: '',
};
