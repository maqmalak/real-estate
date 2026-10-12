"""WhatsApp on top of the official `whatsapp` app (Meta Cloud API).

The mock client patch is installed as soon as this package is imported — channel, calls and the WhatsApp Message class
extension all live here — so mock mode also holds in `bench execute`, the console and tests, not only in web requests
and background jobs (hooks before_request / before_job). The patch checks RE Settings.mock_mode on every call.
"""

try:
	from realestate.whatsapp.mock import install

	install()
except ImportError:  # whatsapp app not installed in this environment
	pass
