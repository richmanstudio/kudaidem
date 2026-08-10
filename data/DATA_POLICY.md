# Data provenance policy

Every production catalog record must keep:

- `sourceUrl` — page used to verify the place;
- `verifiedAt` — when the record was fetched;
- `imageSourceUrl` — where the selected image came from;
- `imageRights` — whether the image comes from the venue's official source or still requires a rights review.

Unknown prices, schedules, coordinates or contacts remain `null`. They must not be replaced by guessed values.

`OFFICIAL_SOURCE` means the crawler selected media from a website linked as the venue's official website. `THIRD_PARTY_UNKNOWN` means the technical image is available for development, but commercial reuse has not been cleared. Before public commercial launch those records must be replaced with approved venue media or explicitly marked `APPROVED` after a rights check.
