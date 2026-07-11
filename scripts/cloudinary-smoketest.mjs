#!/usr/bin/env node
/**
 * scripts/cloudinary-smoketest.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * DB-free Cloudinary smoke test — validates that the REAL saveMedia() service
 * can upload to Cloudinary and that destroyByUrl() can delete, end to end.
 *
 * What it does NOT touch:
 *   - the database (no Prisma, no Image/Video/Product rows)
 *   - any product media
 *   - public/uploads (all test bytes are in-memory; no local file is written)
 *   - your .env or the running app (MEDIA_STORAGE is forced for THIS process only)
 *
 * Flow:
 *   1. Force MEDIA_STORAGE=cloudinary for this process.
 *   2. Load the existing src/lib/cloudinary.js service.
 *   3. Confirm credentials + a live connection (ping) BEFORE uploading anything.
 *   4. Upload one tiny image, then one small video, into shopgold/_smoketest.
 *   5. Verify each upload result; print secure_url/public_id/resource_type/bytes/
 *      width/height/duration.
 *   6. On success: delete BOTH via destroyByUrl() and print the results.
 *   7. On failure: print the real error, stop, and clean up ONLY assets that were
 *      actually uploaded (never attempts to delete the one that failed).
 *
 * Run on the VPS (see bottom of file / chat for the exact command).
 * ─────────────────────────────────────────────────────────────────────────────
 */

// Force Cloudinary for THIS process only. Does not modify .env or the app process.
process.env.MEDIA_STORAGE = "cloudinary";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SERVICE_PATH = path.resolve(process.cwd(), "src/lib/cloudinary.js");
const FOLDER = "shopgold/_smoketest";

// 1x1 transparent PNG — decoded to an in-memory Buffer (no file on disk).
const PNG_1x1_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

// Real, decodable tiny MP4 fixture (~12 KB): a 16x16, ~1s H.264 clip produced by
// Cloudinary's own public demo account (res.cloudinary.com/demo, dog.mp4 downscaled),
// so it has valid ftyp magic (passes validateVideo) AND is genuinely decodable
// (Cloudinary accepts its own output). To use your own clip instead, set
//   SMOKETEST_VIDEO_PATH=./yourclip.mp4   (read-only; nothing is written to disk).
const SAMPLE_MP4_B64 = `
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
Lm9yZy94MjY0Lmh0bWwgLSBvcHRpb25zOiBjYWJhYz0xIHJlZj0zIGRlYmxvY2s9MTowOjAgYW5hbHlzZT0weDM6MHgxMTMgbWU9
aGV4IHN1Ym1lPTcgcHN5PTEgcHN5X3JkPTEuMDA6MC4wMCBtaXhlZF9yZWY9MSBtZV9yYW5nZT0xNiBjaHJvbWFfbWU9MSB0cmVs
bGlzPTEgOHg4ZGN0PTEgY3FtPTAgZGVhZHpvbmU9MjEsMTEgZmFzdF9wc2tpcD0xIGNocm9tYV9xcF9vZmZzZXQ9LTIgdGhyZWFk
cz00IGxvb2thaGVhZF90aHJlYWRzPTEgc2xpY2VkX3RocmVhZHM9MCBucj0wIGRlY2ltYXRlPTEgaW50ZXJsYWNlZD0wIGJsdXJh
eV9jb21wYXQ9MCBjb25zdHJhaW5lZF9pbnRyYT0wIGJmcmFtZXM9MiBiX3B5cmFtaWQ9MiBiX2FkYXB0PTEgYl9iaWFzPTAgZGly
ZWN0PTEgd2VpZ2h0Yj0xIG9wZW5fZ29wPTAgd2VpZ2h0cD0yIGtleWludD0yNTAga2V5aW50X21pbj0xIHNjZW5lY3V0PTQwIGlu
dHJhX3JlZnJlc2g9MCByY19sb29rYWhlYWQ9NDAgcmM9Y3JmIG1idHJlZT0xIGNyZj0yNi4wIHFjb21wPTAuNjAgcXBtaW49MCBx
cG1heD02OSBxcHN0ZXA9NCBpcF9yYXRpbz0xLjQwIGFxPTE6MS4wMACAAAAAh2WIhAP/zR8PqyaM+x6ndG1G/U2I+iAgvCVoj+xg
/SafqssKLtkF2LCBJbYiQ/LoowcI7e3FbHJJ4ARbI8Ez2BOAp9050Pid7Ems663WJkG/ySeThJg0UmDjDCS6tChtSBZ4V6hvoEo/
2MdGfONb8odtV+UJHMIDck8Fty+TsBtIwxEfasC78SERRQAUUAFG//EKWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpa
WlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpa
WlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpa
WlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpa
WlpaWlpaWlpaXemiFLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0
tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0vCEbz////5kB+YD8GooPAL8A9YoCiJJgPwaih/E/HWKhrlv/xClpaWlpaWlpaWlp
aWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlp
aWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlp
aWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlp
aWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWl3mYhS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS
0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS8CEbyzfgA///+CtdNg1hYqB0JB0YjAJBZFgQa5SFZNTIm7B9JqcXDUTlJpB4rFMTD1+E
gc2c8kyC4+sdGiM4Q/REnjJqOTEEmcf4vBg+DOvjysAZ/u5NXBWBhKKnDLc34P7/ewG3fM78QpV5Pq/G11/V84lJLJWJnYNcMz7d
t1SsJeP9XhmmcQkxp/E/oYxYnn1bhjHBUQiqGZ9CYncWO7y55eQRkTKgKBkCKFRtGastuAgabbZaALisy591AmYGZXA9M2uM6beS
gCFu5+nysUTrcxIWU92TDFj5N4vfKSKSKq5kigBjF00vf1H2VZBlz0wpIEBF8k4VyIek1BGfeAdXYdUXgAfuDbcACM55wJbBnGnM
LNkWneOrHee7eBHUBJfAWqDsaAoKAsOgqJBiHQiHRiMAiECKzLuquqhaUlExCn1c6nm8NRUWel4CACsQpMIQW8g0mQyk4EEmtpOb
ZIYKkQhvuxWi5g5n7z+v/e/1fTMlfD+9mZFF//PKrZDI4/AknOmdxlEU2y2AoAxY5qNzKQBZ0ujJlVSoq2fY8dKS0SE7NwCtwSMA
hq56bcjgdM6jE1slszquyhFKIiDG/oWW/ZdXZRKIY5s9E9G39/y+W0106oaFI2sA6jkXANpOPaJS7PUH3RLbuAzCA+QPw84AFrgA
bD0zqEtkQAFomhol8dsNKq4nwCEby5rgACRfuWthBo8EQNhocGQYpIjLKVJKqTd1ToZaSiEviHAXsmByH8TQrYgkd8fPhtrl6vn9
aS4IeYnTYDNFtncPK9X6QwUBmqDONR6BdYf2XkasoCgJQETfxM1TjGMQniIMETf6RLz60SUBzg9k5hQc6txN+8cF0aiNjimQNhb5
tUrLlUJBjiJMB6+3bGocBlxIOWs7kJJQAEEAUMdV3txiUTll0tPIDYqFPGWc0MdaDIlKco8/gAsryhOAhUUc96IepfMMY3KHINq0
9ukS/wJvles/6/gad7FX+neDNR6Atn84UtVwA+vy+5cX/BO/FmCyCoATmLgLSzqfnGV7ChJqrd92qopmfp4M3banF8tUqcvlZtWf
koSREDRGOgoJLS1SY8BYZhYSkAIhAIiAIlN2WCFxiKkKQsXp7IsdDBMPjmu6WLKPHMGCEEXTsyLAw/aNcICVEnhIMbGwnAyHa9Iv
rNgVUivg6m/vnMn6srLQuyg2FWpzqoB0v7isjQ84AAjBLh/eV/R4BITr3T32CdFxGu37evJXiAA1vltha9dUJNLtscojHppG5Eyi
cvM1iAjXx48e1lLfP+PUziJuCr28mqVG0K6qTsGjbvfqH1Tv9pZgt2grMAWlJT84y0WFJpK1unfVWMlJqZs1NqZpgpy+UYqWnmUg
kHCAiiBJswchG8nYayAAP/mKVZafB9UFd9Kp0qFSq0WCoSz6TUWrQAQMc6MbTV7eWkYNLwxfzkZAziMO1t6aTAzNSymbLyfKTnmF
wfbzzEeWbUjp3jpPzGqXCMcOilcyub/iWN/Wyz4UcF/wNWioJRb22oysXtimGsU6BuGcMIrxNUe65X7/xEjDLQnnkrXLqdOlnm8M
AssNPWH2XIQyePzvToFsEktJdKIt2iceFoSdSIlaVxSiSCZ8dsp6Deu561rCZzhoSVLcZwY+HZTZYH1jOAmplQrlGyJEKVpK2dXM
pugSOPCHKjsmcqZlnOhOqqlpR3OGoAAly9ShHnQLBQWqBCsLWVLFW7qXKtEeyakStD5GPZOVHSLlmkQHqG81R6EBTXzxCXB65TKc
ukBwohxE9B9bn4du8ycKK5KGI+h5cRGEKEURsPnk/f2efQnshQgo3cWwIHTaTVLn8U6qojuqAF1od6p0fTEu/Z7ruU8AYyUkV9wU
Q2kyug7Mozw16i6QV/Vnd3j4IRvLfy8UMAAJq3xBioMUCqCquzJUXAFt3Eqw1LQJ2Ao8+OPDok1HRZq7VpM6ClA1dzPhag3Ov4qL
wwVWaRioSKtNjWnL8xgyNOCFArFyJc9Y3w6a4bXp/wwVxaZD8eejMmyWc+k61qUUE1R2kO9cRKE/jzvQLj6fkz8So0gcHEVV41P6
rHCiUizEKv6fu+7wQMXkQiW9fkXMnOvTyoh3ADN8elU4JBbKZZsgswtiINVl75nptKnTuAh4U4FOpEsVSn2UZNXZXLlVbXnhQgDc
y9siC3R4oRANHm9ur9mWq8SHgiyGAa0MMWl3PLffjsp+9JRrVagS/A6gHYePVCrvaFhcquNOshOK6G9Hr3V/GzRWPdeyF6tycwWL
Cy4FBEmd7y4qpCrqpBZIkYvcqlSpRAeIAICKSVqio9nYtjUAEFDKbg/Nj1zyxEqBC5KNqDwLOsa1CSozmHAAe++xMcMSSBaiCUSK
ikHCDI2P34WVWZRTIrF59nSVu/X+G7/N365eVrE8s+v+46pRIiJAFjJOIwAgAFEVS1TgEFwhG8vGYZDTX/nLZRoYw4CwtEQdQKyL
EG9QgFib1MfetS5pLsFLQkdsW6o004wBacnYjzDmQrmMOsD1wT0ogAtAsJpEHK004GZ1X/unM8UjxFMhzdw/F8pSTKwFqxJKfsdr
kkp+FmAFWYJArfGBwcz657Y0LDrEkkhVwrnw09UVVs4lsdR7vuJLziZ47GJRBhecNtxEWrLqkmMbUCcDfbXZgBo2GV2VGibwWmhZ
Jjsa+ZGclPd16ZDAgiJbWNrVlQrM9Bpa9NNOfPvMzMCcvN7YRERhIGpSY6+qNlRsaqGDkKiQZlgFCKHRCHUNZaZl3YQsUhvVhHja
XNJdjdkgIZlvWYTy2fteHGiWr9T1K59g5h+w+TXhOQvhgqbm3HSDQ320hjJz+hZYsVTKlhlXXt2Xe6UYczMah4dneZQDa3klzsmy
8oa6Mn6MYLrlQAFAJazKVQgq7vjW9UqZzGHp+ZClohHs2XiZLlGgBBjBuLd+S2TvZcADYoX9e8XEQzN3jan8wDghG8n/vz9Z//nY
La4XQYMw9QIlVUrLtISZly1gF5Lh7Lmqa9rCmjMx+H0S0RAPkdecMEhoqCkb8tOhSs4FFCmFWQvJry8qYjW7PrqqxoZSaoYgIp7q
XgcOrksai4pTmkZAYtEsJJHeGENrIQzyy5iIpwpKHS09r3sHsGp1DDCoj3n1gNZ25LDcg9xDstmovxf0iygNNVWVnBLiEz4UcuON
eAokpoo0GIsbEJ6RBM07nOcsadiTgjOIl4N8ZbOro1UieAAHrq7trZxw2Vs4BXZjPOiAq2SQDANVkbJCAHVDBA0J58t8jValVEcU
1E1o2WCdprJELIQgi1ACA3F1oRhogLQD0k1dSx2WrucxW+hPW1YgKOGqoJw5gpy1a1mMvvt2WdOSxbgFH9Rlp7JJRON3Gap6qbCV
4pPdXdcBviq3W6zdqWiLZAAKUSaBqDMIURPaE2dHlQCAxG6y5D7P0VItNjNd485CnIbkIDSUKg6SB/tn6FbvprRvGYC/J299Dqju
zzLTenC5TwxNcCWgHCEbyH++/5n/+cpsMoUIQWiIWmKG5AtVRZYilzbSPgvVxrgLDKF8r8TDKESYqrUKQMBMrDk510A6d3n2rHzy
hg+EtiFYupmV0hJQcDS0nNNdl48+Gm+WO+VApyjolLnjbagLfvoqvWc1SyTgz3keGsma/ospbRtXIJN8K6mjLs/Du5U7gZvbtwk4
Z/z1cugNax1biyJ8+NV1S5i3JUcACBz30sNCEp4kZZ1uwVhZjHUBS6TBqezLnS5SzqcWZ6rqdlSrV4cBAitZ6Mv9Huolu/4ChnoB
bqguo2FlxuYQcYKzG2rSLuYvtkVPU1iQNTsNBsIRaIBaYb1iwil2gBBdB511dtdDnT4JZGzd9wq9FEZM9hIgRst8j0QnsridAnzQ
SgRHx5zvpjTib7uoHiTyrpIE5Naf7llVes6jXy6I58o4XAAxfh8e0ApaIC6e6/Zt9vrJ3rTvAs4KJ/KEA2OGi94xHSGDjVeBj6GY
cTKmUC3xoG8kAEALq263kJVMem1nBtPuDiEbyfe+ORE9+gprGoUJYcBcmjEOlVxvVMUlqTBqUywRaHzcaXehpgEExSlAAt0DLSeq
9flhKWdEmmBSSi4rt79dvFVkl8Sypqzxq158vKyeU3pf7np5L7yqBgoCCFYm0mQb8aRMOuA8NY3Ai0AiIrYbgZdQzbLJWdvaU90S
+s+m1vC+nXM5Uxw3SbhopwA1ZHl3X46biHPdOQHTV81opei6k2Yhv5z5NzK87avMjCkngIIqde9x5ksqRnvx29ZhcbnU8Lp0se+9
rib9LRAVoadOQ2e+2IM+Jy+HmMAW2Auof2hw21kK7SjhrGcbHUTDUQi0Yh0pFgC6VZAQXMGng110u+h85MH/ASBbwHC5OxsWjQFr
rtE+4U7YYIUjqIJU1tD4S6sYi4swUmClet8DZNgvM3GGMSIxuFDJheor80nlgAAkjpGMgG2I018a6VCADjYfLHVv1fG4bwFPcrM6
RSBsQHZFy7XvO1Wgmi9XGephdgXiN0GO7N36MGcAErJjkTLwDrC22sgHIRvMrLowFX36KmsOwwixQdRaIw6haiqssyQVqUBdaxj7
461aXc0DMQTkxmU+/rUIjnnjMKUAvOQolaBwVQmXOT1kpajC+l8bJ7m/y+gjuQUJ13UBKAlwfa1cNQcDlrgEA8e3tw32gEEMU3N0
yxPCpAD+FxQY1OfbjSM31H4HzIj4qxupQroeK563cFRZpLgAMpwTBtflYImlCpOScmotKt7THRE+dyoECDlt0FkuKUAyzukwWNdm
xlyaQ0B7E8Y4TgxOuvOsT/t+rokAnuyc+32thPV0p6yUeEoWBMVBGLRAHRCHSgrKuxVRBZULAPm717W1NCNn7InPU+gJgD4ZNnme
LFbMoc2UEW+YhbHCCdJJr2NE2mWF9oo6MKDek5bxOhKctshb4DLm7m5jX4c/R9G7894MYjTTQHfmDTbLQeUmXwdDgcsOtI6Xzpne
sbM1KEep5O2oXMHkACPLH22XQaGCMYjHLnsU3qTU27dp1YGYN2Ydr7r+i8Hbh4SD5WKQj9zgIRvInP8Rvf/5+mwahwhhQJg6Mg6I
Q6V3TTJUrVSYki8CJUukAvi5ohoKVkQ6L2MnJezbyiZ7XWA3bgZwDUu+K5MJk6bymIQi2fGnaCvPyfCxZXNbbHBMEm5Ewe/aHDAG
/4/pa4yrdOVgInK4FZZ16wnvJvthXpdLX9Nr2AZYmxjNItkkVytYlMpmaGaw2OKm9Y7dsvHO2kdVVvuAvXZm9IywVl1Jr1MGckcC
IGroNHsXwOUQ2xZ349MlAzEMTaGhJ4OWFgBv6E8yBMuGnxxUBktZjNpaMlDZogQYGwzIgtGIdEAdKACA3drqVKGRo+Jq6uSOBCEc
dW+bIeGJRSY5Z8M7/1HrJgGm5Y8Gc1/B91WHSPu+nEYyGIWykxNhLU3n7ONLr3DOWIV9mehosAybtufNLU5zU5BmccwTUKnjGy6r
zMqxqPAoQ5AR0zE7ipmRMh89zlpt2/l+vdK139Ny+QSROQEpgfyPRwL9D4h0ueafHARDOEI0DiEbzL/n1R/v+gtlGYViojBoKBgS
iYSEFAABGEiyg0JmhaJegpqy5upusXR8CccvgBw4N+b6Q+BXE1uF4RVKDlZ6dGmeZMFxhBOZ0zJByZVMXnimfq99kCmywqZu21Ti
E3as8mXiHjTTj1DaTYsqaC52kdHHjjvAC2Fr/97meIyvsuB+bQAGQEkqGj+uRgN14ivO9Rwi7mALnODAUG6p4MqXcXEcAOXV49Gf
h8POPHsVmAvuu6ffRRKzFgs0Sa6Lu2h2YL65ryrezWosiw7vZ0Y6N9HN3GaKLJcSFdEtgrVdwSYJCtmca72x4IPdVTBJRG2zBWEj
HTlrClcZCNe2pWQ6+HYjAQaozI2A8DUAkJwEUU2WUi60gWAUdphTmoJhYKpAOhAYhAjaTNIEzWCSIVVrDTx6DMU/JJEAseANYph5
baRldcfzUpKgDOS60vJXRILkUvBfEKnrEkwVXCCiq51ffKCFBawngYfeemwnIIyzxy59bqZgvHUEyl+OZU2Tm93RFxmS6p8oCK1/
t7ffjo+dBioVqs9XGdIBcjPROwBfdz7/5TlUMV2XdZwlkBYclyADCssIAtmFIAIg4CEbyP/bnXP/+iotjhFmg6hYMigLBUYpRvSM
1uWkGgxM1WhYs0XVh4KJlx+CpI6FoZdG9ZgbZ3LMV6CexXf8q9smsrBL9P9hC4SuuBaWhs1HKPyPrvh0C4msqDYYzFyI6paR9hc3
sX22v0LkEQGYWLOtq5DbVwHjBcpkzFQTNRsfJxY6xEnctsYjDvfpzoGjrgAQtuFr/OMb0AMkiI5SV58WmsMN+QR0vwPsOqQleWhd
q2RcITjCoAy3njKvTbXFxtshVOfotK+oUFxn7oiEXYGJzUrgYqDHIUHDFH94pehiowKLx1UtAAIYtl/HCjveyZ5t8ZTZDF3oAES4
xmQwTN0vcckvpAsAAKTiAE9aKLCTEwiDATEwVGIwUAAyXQcAgQAB3auKEnwplyt57whXm0zh2u2nz7/lBokWYSsln5z6WXCj39K1
bwjckwhNKaKm4vs3PQ49e9C46nKACjW0amzRfQMCun++AAr8WXo8kcvPWS00NplPRd5NJLQzy7b7+4CENVEK16/CYmbBe/u7Ka2L
iWKx23d6JuNy6dIuU2LzLg7geZwhG87ozv/gU5n7JFmSohUGKgl83cFoyxKhFkvgucAc86aW9Ef+0RomC7sY+dc9pIvSPoubauz+
+kAra3tnaoKQQVF3oG1r9nii8ZL8YQ0SkXCne36EXEvkKhhTJElIRbYjunkvOC8YErO7kkT1HjxkDI7rLSledae+WCgSktwppqwg
zAgOCv83e8+Rqq3idO+ENVADp8EAAtkQAVVVTlCuOPGFPByczd6gbEaq1VVdWtT6unWgLvGs9kEoKkZjb5ITY+mTpc4zUCOH6fj3
6wgWD6LgCWlmEKJX6fIkFVAAJJpgllF9t5SjLPo/CyNav/2lSm+0HujqhxACdDaIRQ2GI2CZEMAdCAdEA9EAUblK0uoTJCFaC7B2
utAYYjdHieTWooGhnGSz/vFgyKhM9gnX8Bqq7wshmGr0jFJcoSZljdpwKlqT2chMuRYRIFl2qvlzgQIvMAxTYYCS78vHPSYuMTrq
4BP6F3X15SDuLm7uYe6cjIqdAwwIz6t0qniwsaJgDEdvvKW7vf4hG8/97frwAAorHD2RQUIomEYhUobtVrIEKhqiol4s9kXqwqDi
JcodRt1d5NCl6NvM0ICy9lEUhu8Gjk10xRMYRlDeAFLU1EYNlYUmZziloSfXhVRYM3YBskEDEiNVcRRf9vV0knE2utPCryqRrjde
GGbyk/KfbNJggam0dsFcA89CarSrKPid5Xn3ZALT3a9Po+nsFzR4sppmjdTni2zt6zwWYP52emcXlqc3e/GKmK+1DnBLt6IniyYc
3aLGk8QrOUwAjDDUBSNIVkBdJvWlbSZMbChKdwBrCVKi9FaAy6k2DXLohIe+9ddFgEFFQ4eawEIferdXSVoq0EgGj0q7paqJYLiG
grF3U5Iy67CXfQaVfRZ46DYkSn1vQ75LnBIigSUOsLA5Ph0LIMH39/hr+ZxXmB5z1nip60vjPQ8evRrRavHmx4Pq/lNwIRvU7Z6b
CGOhBQZFFwStBuaRUq0iLEWagy8omQaNuHM55hySJqlO/ApmNR6syrFtsKGp2WyWUzWS64eW4IikEZw3xmfq+GyeQ8MmpqijawnX
X4y1eO6ZWEpoDJnGHkHp1WLIn3dDjmo62a8tGTrFVDdLPpcK0AuW9Nw5YZrCROOzYqI08pX7VuwpQQ6rqpaFNZasMQSYiJ5MWQjG
lDKKiMJueyKpsYjkNOLURJGVaLQVdfdbJulxfuvag00fK6aRiB2qrCtcEP2y8QOXMzyhYWeljGI/NOJsVu9XOlPUuxn5pNHXN21T
/chnnQKUvCA8slS4qMlVSy3auYJWqAn2CEi3dYlxF5rJkwiCasdSUyCMiCEgINqsVAK4AFhoqaHcC3Sa1UJfP+bNm1f4wXvuBJ9J
gccLhuLrNh6Dj3kY3UadqWtAUgju4U5jWRpNtAJX1gfdIDn1Ut4nTKD3z3XvcgGPhmE5vGMF4Ov6vu7PhxHPP1Ja7gVcjWAdkE+V
k8qNFhAbqIMebIaa6YmXsWTJl9DQqVimUwgAZwX/PhNUHCEbz///////+iqMIojCQTCUOjEOjEOjQiwkSlXVxBCIHjJerrjQJE8K
XePYTFYRzf8KzeLbV60MdQckZKK22aRyydpJlxvhGRYsuANK32QQUpKWimWV4ZIhlQKLxi/ADd9TFr0UTQ2g8UcibCMck1OEJ7BJ
ShW+Ej7xY4yhHFJINFX7KdkD19AqiBidDrr59jiZuDi7i2+lqvR7kVMqp41Xg2zUpWu+8gmB26sCmtTG9VdKBXe1aGgI74DePOgT
csZyuqxxBS79UwRgw94o7K6KAOigs1MggjgKFMgB0YB0YB0Zjh30qM4QVYC0EeEl3VyxVd+Kc8gUECPzxrc6tjV/hIJQLiEH3wz5
P1yTMEoQrIBszcoFxKp5pfIuE1xC5uJLdojGsYYHZoJNDDUvvGVtt2GnPzCCf2A0p8xm/iJ/w9JBk/81/Wv1aWmp7bms8hR5dDTA
GRuut0ZsvnWEy4aaLh4hG8+195xAAAoLHTkFBKGx4EgiEgROAAKpXQShEiUNAUGhGfOVAbR616GP75ztk/6S0MKL/hLUzA8BSMZS
U5EOFs7IGucI4TsHpwCgqdZduXPGGuPTtMTYax0Y51krEQpyZQczdlUaqUCXp+Ht920WOIB2z+WhYPnOhgTvR49KkEgFDhcgO8rN
tcIOV0MlxypIgAWX7TxdkjzdnJs15TFnOIOccQd7MFiIMzzVBU0VlWjq+BJn9xabeXfT/UHz+A/eObAEBG6j1/vjE2eIf039PYmt
NVTLhErfRxADKfGVHhF6AOGFnIxPHi9n7ecU0y9GrV7mgPzTh8PR5cJFKq8VBpWAAWi90Q1gpk9L141NkykqymN/REFHY4SxkMwi
L8GKkRVm9IpYINeCqiRIrAYTQFh2HGGjqZ6VtAiZybzNMI8SZPrzCDGcHs0hM+bHd3268ZCHpVMBH0I7kt8KFSMdcwgV3VCKJmTs
ZHjIP/YlACcHZvkMFcsHIRvKv48KAAAKOnsShspBixReXCQN8Qqtbl220C3Ai7WiNY5y5OdVqvRRFEvMHnj4BVEj6oMCO6hJ+VT4
60VLAu8TKSFe3Gtw7tKzyFfXnfsAcHRtOrdTLdbuXPi485FEJ3LJIoBjZHw/KoyhZPNHI7uEtf24dsl90u/Thzu7V63rxIALBqLS
WcCgCqrBwlCMxjKvt7J4MO+ufNMck0ovb+fwIPwsOZA7zqbSSXmfjq77Lzo+L3/w/AZduCH/7Q8lmSmCadwcKdMvuDyCWiFr9K6S
vC6fCgVO4KwAQuUvsUmXY6GYA+4QTJxopuFSmKaM5lQFFY4Ux4EhPqqKFkUtIQqczKiVl1JIUFojWOiyuWglJUrgzLxOkapkPkBT
wKf75C6vYZ2vrt9RciK+n2RyS5qy+UfYLzYxEyqNA9KXnRRqcueEbUDmBUO1/FTBafghG8r33cOIA/oqbYYIg6CgoEwpOglEKCJR
pzbNKWJGt3VOMpd1F3DXQaHIFVTL1ASseeUwYebKPlOhj4+cWoORaJ0cKIykvpbiiXDPeIVLfGNlQZe2/DyvUXjEcihDe2+lhiIo
XBWeX3Hd31qXRZoQifarap5xnArpsBSER4jsP3fz7Q08YKYrjHpux945EXjlMJsaOn0Ghx4rKWUjGHjN6xBEXrb+6cPodtZSF45Z
cnidd0vT0dJFUSVXyktTRQsAvGfmn2c04TdZ7/q+fyzAxIbj55tIAunfWBvgFf7Z+FCO1jk6jpN9QlWCpZrlszItCWGy9aCIUCIE
RhqO9y6pxxXpSogBR25loNT6IR6EDLblkY6KzSUuAmaDwLeRIAoKXL/SSqUBr5iMgO94RxqdAFIcHtpmq0UpLUMbt9VQ1FLpXQx4
dQ6a9H2cxIoupYK52t7fWisziyEDMyezyoN6Gt1iCf6Gce0S40ax6f7dkRjBlgrHd2/b1ymgCY3NgzkYmOu5AF8er49HziswCajn
19E/Kh5MX5gtwAJAAwchG8/n/9+AAAoqixKCyHChhUEGLFqStAWAWata2lojbygpR4Vhq108Lx9Qk9CqkXg5LSjbo5yqLQVmUSiC
TPad5Jd3xxbIYOJZjEkju8lxMixjtqLxhJTPhDjAsyAbsBudmMyxZkufYiXTfoMKWhWQAv/rM5VaP27tTsI2FCAET5L+Ljlr1irC
rVMxTZl/6/SOq4tbTiAPEvmfjVcD/kPtGVnw76H6SwCo7u91sAAWr1EKXYAQTU8Pf9QwkQUjUCGh22O8trz9YlPvABQU9eSQKe6W
WNRMaoJAJ7sE2wsWjWwBd0CDPLtIAFHQ4eQ4CIkN8TerpKF5YiWCHOUlLqVIC0Rt5EloFblYyFCPPfmEUpbSUJN6PLnCAlVNPQr8
eKSKitpZ3FpRDYAxQ+gD9P1UFPWAIBw75q7MAIy24Ke13+ASRa/GDnYd657gIRvN21ecwD/6GqWIA2OBMKAsVw6opLqsurOgF0Wx
ED21xItNrRYm3gAEkuN1UpzAdLMyxAoGEsl/k9giCPWOCSI+qVg0SC79uyrJS4CLNzJ65lLv3/Q+5Xd1hnQxRURwBiBjivtUSsLW
ewX6tr3kdYa7xhKQR4XgUanY0qqw7nrQPR9H2bx1jcompeFM0xTKu+6TUyjrYg3X+FFKMIzjqWgC31tpC+TG5WOhTO9MwoBA4od1
QVd07hmpQgLdet8/21TyXXg6hbS7F+MtNyGCiAEnCbxWyYmYAidXVookQoEo4CoUGwTNqhG+FXFSwLAsCHfxJJqpytFKLuAAVAt7
Ufm9OMoY8eJm8PDprHRWyeJnzLO6elyjXfzYOHNRmCGDBVbsDL3KY4gApB//I3qjO6+tzbkL4Dcfq753INtrCjp+RosfTJCkKgJq
TjWrXst4jwSadhDKx1aft4Q5tOx4+k9ltRaTnWwqE3S/0XDmNbW881tMNnyWzcG94CEby03TH7hwGRtKLYSDYJCNOiEYBEICoIId
mgqaY6UNLpi9O9ovGonHPwAPWKMhl7Dcu7dzNk4P7rpn+LIJts0Zk4dnCkePVd4vP/KqBf+KiS26lZt+a7VCyNZd6fNRgOMwAYUF
Le78VyNW4YSP3doP74+5A/w3SYsHyW9eD/9t+FnhYhzROGjvQy3lzQw73Rzb0cGLssQHRfIAApFiAlgAAWCICWCdnZ2djWrUyCgM
abNp6enp6enmyo0FECZatZGdnZG1IlhmYgijRCMCEEhkVWaEaBYOiwdT2m+2onHPwAPWKKYh63RkTF9e4u0c69VD5hxWjeydsz9l
Hi2bEiqa0S/Wol0f1V3+dbLxX4r+tLeJxfAevwgacWAxbdBm6V4X96APjOXuVAiS/nGCweEGP+AeatO2GCWBieYc+gBk/ixkoSwZ
YCnheSIPNAAD39/f3GT4+Pj4+DD39/fgAAAAbm1mcmEAAAArdGZyYQEAAAAAAAABAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAUCAQEB
AAAAK3RmcmEBAAAAAAAAAgAAAAAAAAABAAAAAAAAAAAAAAAAAAAFAgEBAQAAABBtZnJvAAAAAAAAAG4=
`.replace(/\s+/g, "");

const line = () => console.log("─".repeat(64));

function printAsset(label, r, source) {
  console.log(`${label}:`);
  console.log(`  source        : ${source}`);
  console.log(`  storage       : ${r.storage}`);
  console.log(`  secure_url    : ${r.url}`);
  console.log(`  public_id     : ${r.publicId ?? "(none)"}`);
  console.log(`  resource_type : ${r.resourceType ?? "(none)"}`);
  console.log(`  bytes         : ${r.bytes ?? "(n/a)"}`);
  console.log(`  width         : ${r.width ?? "(n/a)"}`);
  console.log(`  height        : ${r.height ?? "(n/a)"}`);
  console.log(`  duration      : ${r.duration ?? "(not returned by saveMedia — check Cloudinary console)"}`);
}

// Verify an upload result BEFORE we consider it committed / before deletion.
function verify(r, expectedType) {
  if (!r || r.storage !== "cloudinary") {
    throw new Error(`expected cloudinary storage, got "${r?.storage}" — credentials/flag issue, nothing was uploaded`);
  }
  if (typeof r.url !== "string" || !/^https:\/\/res\.cloudinary\.com\//.test(r.url)) {
    throw new Error(`secure_url is not a Cloudinary HTTPS URL: ${r.url}`);
  }
  if (!r.publicId) throw new Error("upload result missing public_id");
  if (r.resourceType !== expectedType) {
    throw new Error(`resource_type mismatch: expected "${expectedType}", got "${r.resourceType}"`);
  }
  if (!(Number(r.bytes) > 0)) throw new Error("upload result bytes is not > 0");
}

async function getVideo() {
  const p = process.env.SMOKETEST_VIDEO_PATH || process.argv[2];
  if (p) {
    const abs = path.resolve(p);
    const buf = await readFile(abs); // reads an existing file — does not create one
    return { buf, source: abs };
  }
  return { buf: Buffer.from(SAMPLE_MP4_B64, "base64"), source: "embedded sample mp4" };
}

async function main() {
  line();
  console.log("Cloudinary smoke test — DB-free, no product media, no local upload file");
  console.log(`MEDIA_STORAGE (forced, this process only): ${process.env.MEDIA_STORAGE}`);
  console.log(`target folder: ${FOLDER}`);
  line();

  // ── Load the REAL service ──────────────────────────────────────────────────
  let svc;
  try {
    svc = await import(pathToFileURL(SERVICE_PATH).href);
  } catch (err) {
    console.error("✗ Could not load src/lib/cloudinary.js.");
    console.error("  Use Node ≥ 20.10 and run with:");
    console.error("    node --env-file=.env --experimental-detect-module scripts/cloudinary-smoketest.mjs");
    console.error("  Original error:", err?.message ?? err);
    process.exit(1);
  }

  // ── Credentials present? ───────────────────────────────────────────────────
  if (!svc.isCloudinaryConfigured()) {
    console.error("✗ No Cloudinary credentials found in the environment.");
    console.error("  Load them from .env with:");
    console.error("    node --env-file=.env --experimental-detect-module scripts/cloudinary-smoketest.mjs");
    process.exit(1);
  }

  // ── Live connection check BEFORE uploading anything ────────────────────────
  try {
    const ping = await svc.verifyConnection();
    console.log("Cloudinary ping:", JSON.stringify(ping));
  } catch (err) {
    console.error("✗ Cloudinary connection/auth failed — nothing uploaded.");
    console.error("  Error:", err?.message ?? err);
    process.exit(1);
  }

  const ts = Date.now();
  const uploaded = []; // { label, url } — only assets that actually uploaded + verified

  try {
    // ── Image ──
    line();
    const imgBuf = Buffer.from(PNG_1x1_B64, "base64");
    const img = await svc.saveMedia(imgBuf, {
      filename: `smoketest-image-${ts}.png`,
      folder: FOLDER,
      resourceType: "image",
    });
    verify(img, "image");
    uploaded.push({ label: "image", url: img.url });
    printAsset("IMAGE (verified)", img, "embedded 1x1 png");

    // ── Video ──
    line();
    const { buf: vidBuf, source: vidSource } = await getVideo();
    const vid = await svc.saveMedia(vidBuf, {
      filename: `smoketest-video-${ts}.mp4`,
      folder: FOLDER,
      resourceType: "video",
    });
    verify(vid, "video");
    uploaded.push({ label: "video", url: vid.url });
    printAsset("VIDEO (verified)", vid, vidSource);
  } catch (err) {
    line();
    console.error("✗ UPLOAD/VERIFY FAILED:", err?.message ?? err);
    if (uploaded.length) {
      console.error(`  Cleaning up ${uploaded.length} already-uploaded asset(s) (not touching the un-uploaded one)…`);
      for (const a of uploaded) {
        try { console.error(`   ${a.label} destroy:`, JSON.stringify(await svc.destroyByUrl(a.url))); }
        catch (e) { console.error(`   ${a.label} destroy error:`, e?.message ?? e); }
      }
    }
    console.error("Stopped.");
    process.exit(1);
  }

  // ── Happy path: delete BOTH verified assets ────────────────────────────────
  line();
  console.log("Deleting both test assets via destroyByUrl()…");
  let allDeleted = true;
  for (const a of uploaded) {
    try {
      const d = await svc.destroyByUrl(a.url);
      console.log(`  ${a.label} destroy:`, JSON.stringify(d));
      if (!d.ok) allDeleted = false;
    } catch (e) {
      allDeleted = false;
      console.log(`  ${a.label} destroy error:`, e?.message ?? e);
    }
  }

  line();
  if (allDeleted) {
    console.log("✓ SMOKE TEST PASSED — upload + verify + delete OK.");
    console.log("  No DB row, no product media, no local file created.");
    process.exit(0);
  } else {
    console.log("⚠ Uploads verified, but a deletion did not return ok.");
    console.log(`  Check the Cloudinary console under ${FOLDER} and remove leftovers manually.`);
    process.exit(2);
  }
}

main().catch((e) => { console.error("Fatal:", e?.message ?? e); process.exit(1); });
