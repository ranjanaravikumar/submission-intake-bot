#!/usr/bin/env bash
# Send a submission through the API channel, the way an AMS, rater, or portal would.
curl -s -X POST http://localhost:3000/api/v1/submissions \
  -H "x-api-key: demo-key" \
  -F "source=Partner portal" \
  -F "subject=Summit Ridge Roofing LLC" \
  -F "note=Roofing contractor, GL only. Please quote by Friday." \
  -F "files=@samples/summit_ridge_acord125.pdf"
echo
# Then check its status with the returned status_url, for example:
# curl -s -H "x-api-key: demo-key" http://localhost:3000/api/v1/submissions/<id>
