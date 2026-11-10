"""DEV-only transport used by the expense provisioner; credentials stay in memory."""
import json
import os
import sys
import urllib.parse
import subprocess

method, path = sys.argv[1:3]
if path.startswith(("http", "/")):
    raise SystemExit("Expected a relative DEV API path")
headers = {
    "Authorization": "Bearer " + os.environ["APP_EXPENSE_DEV_TOKEN"],
    "Accept": "application/json", "OData-Version": "4.0", "OData-MaxVersion": "4.0",
    "MSCRM.SolutionUniqueName": "AppBetinhos", "Content-Type": "application/json; charset=utf-8",
}
payload = sys.stdin.read().strip()
url = "https://org23b93544.api.crm2.dynamics.com/api/data/v9.2/" + urllib.parse.quote(path, safe="/?=&$(),'@:%")
config = ["url = " + json.dumps(url), "request = " + json.dumps(method)]
config += ["header = " + json.dumps(k + ": " + v) for k, v in headers.items()]
if payload:
    config.append("data = " + json.dumps(payload, ensure_ascii=False))
# Curl's Windows TLS transport avoids the resets seen in .NET/urllib. The token
# is supplied only through stdin, never argv or a credential file.
result = subprocess.run(["curl.exe", "--config", "-", "--ipv4", "--http1.1", "--silent", "--show-error",
                         "--connect-timeout", "8", "--max-time", "45", "--write-out", "\n%{http_code}"],
                        input="\n".join(config), encoding="utf-8", capture_output=True)
if result.returncode:
    print("DEV transport failed: " + result.stderr.strip(), file=sys.stderr)
    raise SystemExit(1)
body, status = result.stdout.rsplit("\n", 1)
if not 200 <= int(status) < 300:
    try:
        error = json.loads(body).get("error", {})
        message = error.get("message", "HTTP request rejected")
    except ValueError:
        message = "Non-JSON error response"
    # Do not echo request bodies, auth headers or signed URLs.
    import re
    message = re.sub(r"https?://\S+", "[URL omitida]", message)
    print(f"HTTP {status}: {message}", file=sys.stderr)
    raise SystemExit(1)
print(body or "{}")
