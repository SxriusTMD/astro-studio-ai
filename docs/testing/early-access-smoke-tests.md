# Early Access Smoke Tests

Run these commands only against an approved test or destination environment after applying `docs/sql/early-access-leads.sql`.

```bash
BASE_URL="https://www.aerolexai.com"
```

## Valid submission

```bash
curl -i "$BASE_URL/api/early-access/leads" \
  -H "Content-Type: application/json" \
  --data '{"email":"artist@example.com","role":"3d_artist","mainPain":"rigging","source":"landing","website":""}'
```

Expected: HTTP 200 and `{"ok":true,"message":"Early access request received."}`.

## Duplicate submission

Repeat the valid command with the same email. Expected: the same HTTP 200 response and no second database row.

## Invalid fields

```bash
curl -i "$BASE_URL/api/early-access/leads" -H "Content-Type: application/json" \
  --data '{"email":"invalid","role":"3d_artist","mainPain":"rigging","website":""}'

curl -i "$BASE_URL/api/early-access/leads" -H "Content-Type: application/json" \
  --data '{"email":"artist@example.com","role":"administrator","mainPain":"rigging","website":""}'

curl -i "$BASE_URL/api/early-access/leads" -H "Content-Type: application/json" \
  --data '{"email":"artist@example.com","role":"animator","mainPain":"unknown","website":""}'
```

Expected: HTTP 400 with the generic form-validation message.

## Honeypot

```bash
curl -i "$BASE_URL/api/early-access/leads" -H "Content-Type: application/json" \
  --data '{"email":"bot@example.com","role":"invalid","mainPain":"invalid","website":"spam.example"}'
```

Expected: HTTP 200 and no database insert.

## Rate limit

Use a fresh source IP and send six requests within 15 minutes:

```bash
for attempt in 1 2 3 4 5 6; do
  curl -s -o /dev/null -w "$attempt %{http_code}\n" \
    "$BASE_URL/api/early-access/leads" \
    -H "Content-Type: application/json" \
    --data "{\"email\":\"rate-$attempt@example.com\",\"role\":\"studio\",\"mainPain\":\"rendering\",\"website\":\"\"}"
done
```

Expected: the sixth request returns HTTP 429. Because the limiter is single-instance, run this check against one known application instance.

## Log review

After testing, confirm that endpoint logs contain no complete submitted email and no source IP. Confirm that no email message was sent as a side effect of lead capture or server startup.
