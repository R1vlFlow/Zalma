# API contract (current release)

## Health

`GET /api/health`

Returns a JSON health document.

## Official schedule

`GET /api/schedule?program=31.05.01&course=4`

Returns normalized official events. Weekly-block source records are materialized to calendar dates and 185/205-minute doubles are split into `1/2` and `2/2`.

## Personal events

`GET /api/events?from=<ISO>&to=<ISO>&status=<status>&category=<category>`

`POST /api/events`

`PUT /api/events/:id` with `scope=single|following|series`

`DELETE /api/events/:id?scope=single|following|series`

Event `startAt`/`endAt` are canonical UTC ISO instants. `timeZone` is an IANA timezone used to interpret/display the user's local wall time.

## Support

`GET /api/support/tickets`

`POST /api/support/tickets`

`GET /api/support/tickets/:id`

`POST /api/support/tickets/:id/messages`

`GET /api/support/attachments/:id`

Ticket and attachment access is isolated by the current client owner identifier.

## Error contract

Validation errors use `422`, missing/foreign resources use `404`, missing user identity uses `401`, malformed schedule selector uses `400`, rate limits use `429`, oversized uploads use `413`.
