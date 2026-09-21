# Feed timeline rollout

1. Deploy `feed_events` from `appwrite.config.json` and wait until its `recipient_occurred_id` index is available. The API key needs read/write access to the table.
2. Run `npm run social:backfill-feed` to count historic rows, then `npm run social:backfill-feed -- --apply` before switching API traffic. Event row IDs are deterministic; rerunning the command repairs missed deliveries and older status rows cannot replace newer ones.
3. Deploy the API. Configure an Appwrite webhook to `https://<APP_URL>/webhook/timeline` with create, update and delete events for `ratings`, `game_comments`, `lists`, `z_entries`, `list_items`, and `connections`. Set `APPWRITE_WEBHOOK_SIGNATURE_TIMELINE` to that webhook's secret and use the exact same `APP_URL` in the API. Verify a signed delivery with a new rating. Run `npm run social:backfill-feed -- --apply` again after the webhook is active to cover writes between the first backfill and webhook activation.
4. Deploy the frontend. The dashboard uses an Appwrite cursor (`nextCursor`) for connections; existing page callers still work. Redis cache entries expire after 45 seconds. The endpoint queries Appwrite when Redis is unavailable.

Following someone triggers a projection of their existing activity. Unfollowing invalidates the cached feed; reads also check the current connection so old projected rows are hidden. Delivery failures should be retried by Appwrite, and the backfill command can repair missed events.
