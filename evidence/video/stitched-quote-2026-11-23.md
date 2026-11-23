# Sentence 7: the cloud's quote joins two separate parts of the page

Run: `../check/video-nano-auto-r1-2026-11-23.json` `runs[6]` (state `UNVERIFIED`; the cloud judge said SUPPORTS; its quote was not found word for word).

The cloud's quote (from the run file):
> Alternate-day fasting-Alternating between days of no food restriction with days that consist of one meal that provides about 25% of daily calorie needs. Example: The 5:2 diet approach advocates no food restriction five days of the week, cycled with a 400-500 calorie diet the other two days of the week.

The page, fetched 2026-11-23 (https://www.hsph.harvard.edu/nutritionsource/healthy-weight/diet-reviews/intermittent-fasting/, tags stripped, whitespace collapsed), from the end of the quote's first part to the start of its second part:
> one meal that provides about 25% of daily calorie needs. Example: Mon-Wed-Fri consists of fasting, while alternate days have no food restrictions. Whole-day fasting —1-2 days per week of complete fasting or up to 25% of daily calorie needs, with no food restriction on the other days. Example: The 5:2 diet approach advocates no food restriction five days of the week

The quote runs "…25% of daily calorie needs. Example:" straight into "The 5:2 diet approach…"; on the page, the text in between ("Mon-Wed-Fri consists of fasting, … Whole-day fasting … Example:") separates them, so the quoted string does not exist on the page and the gate marks the citation `UNVERIFIED` ("quote not found").
