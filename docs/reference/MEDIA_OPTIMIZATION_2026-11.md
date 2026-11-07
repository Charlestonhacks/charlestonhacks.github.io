# Event page photo optimization, November 2026

Originals were replaced under the same filenames in the commit that added this file. They stay in Git history at base commit `0a52dad96dc073026d3d584b9d908855615a96cb`.

Restore one original:

```sh
git restore --source=0a52dad96dc073026d3d584b9d908855615a96cb -- "images/food.jpg"
```

Settings: longest edge 2048px, JPEG quality 82, progressive, EXIF metadata removed, ICC profile kept. A photo was replaced only if it saved at least 15% or contained GPS data.

The SHA-256 column identifies the original file.

| File | Original | Original size | New | New size | Original SHA-256 |
|---|---|---:|---|---:|---|
| `images/andymegan.jpg` | 2316×3088 | 735,094 | 1536×2048 | 519,463 | `2554fab80ae81e6be9310502e44dd3beef48cee84134f47e281a6040dc45aa9b` |
| `images/boardroom.jpg` | 3221×1468 | 2,154,940 | 2048×933 | 250,870 | `4171e3be1be6ebd3819b04b137ff2b2665ab9ae28ed687007317c2044b615e3b` |
| `images/Citadeldave.JPG` | 5021×4000 | 2,468,092 | 2048×1632 | 420,890 | `35886c80b7118586cbdc9f64353326a35b39b68b33329b23ba44d3f0426e3481` |
| `images/doug-presenting good.jpg` | 6000×4000 | 1,071,774 | 2048×1365 | 347,450 | `4988002b121ca138f9b1a97d88a6fb4fda252ce43be5e52a96d4d65421dc9653` |
| `images/dougexplaining.jpg` | 1920×1280 | 1,232,920 | 1920×1280 | 312,695 | `12b747e99033ccada224571430b267610b1ed4404ad74182f76eed529b90af4f` |
| `images/dougmeganmike.jpg` | 3024×4032 | 1,103,559 | 1536×2048 | 546,831 | `c7d85e4d0103aa585879f547651b92c5ca41cb18e52166d03017279d5a34253e` |
| `images/food.jpg` | 4032×3024 | 3,427,780 | 2048×1536 | 475,303 | `57518701c6d34f8992e267fc83570ae78cb403643e4b7170ee911555f06ba790` |
| `images/goodaward.jpg` | 3024×4032 | 457,497 | 1536×2048 | 337,163 | `49ed6983191ffb1d76593e240adad053c89572dfeecdb93627721306c463abfd` |
| `images/goodaward2.jpg` | 2730×3812 | 521,845 | 1467×2048 | 382,054 | `734f9c565020a8786c46a163c03f386e4a33a6ed8b4e6fc5662d40001b784f63` |
| `images/goodpartyshot.jpg` | 4032×3024 | 2,722,162 | 2048×1536 | 316,707 | `ed0f3932915e48e9c12869c214927d5ccdc1a4069d9ff1bed4892e9519702ddf` |
| `images/goodworking.jpg` | 1920×1280 | 1,043,838 | 1920×1280 | 238,642 | `df9e5b5ce7f3f7362aa0c2f67205a072c2a5833707476ccb3a8864ade6398294` |
| `images/harborwalkeast.jpg` | 2996×1399 | 995,434 | 2048×956 | 312,799 | `b13287dc2c670ba67c17e0a029d7ae8004c3df46e64fce521ae51349ea4acf97` |
| `images/hivr.JPG` | 6000×4000 | 8,404,223 | 2048×1365 | 280,034 | `45ea7ce28cc95ab810af6dc03410d0e2b3f6e788b66da366f545b7f358fecbea` |
| `images/hivr2.JPG` | 6000×4000 | 8,068,114 | 2048×1365 | 282,678 | `93fb234e4090f513463a3dbdcf1a8887f813bb2e41e27f7e2e9a1c870adb0e22` |
| `images/hnphotos-01.jpg` | 1265×1292 | 555,475 | 1265×1292 | 258,584 | `584935fa9a2edae6a69d69143ac792f54811554a60de3152375f9f997ac3bc0b` |
| `images/hnphotos-02.jpg` | 2004×1292 | 726,824 | 2004×1292 | 336,824 | `269a77ceb6e2a80415fa1441af0ccdd853e780f7c025622a5c536659628a5f5d` |
| `images/hnphotos-03.jpg` | 2275×1292 | 787,186 | 2048×1163 | 294,364 | `95a19e8dbb85a053cb1eebe8bb39d153f173f4deaf3ca4be4bc5cdcbbf69059d` |
| `images/hnphotos-04.jpg` | 2300×1275 | 761,371 | 2048×1135 | 282,960 | `ce0524d2d96352fa6c255003ee7cbd68c284be3ffb1cf42b483d5decf3cbe4c6` |
| `images/hnphotos-05.jpg` | 2779×1292 | 708,217 | 2048×952 | 184,974 | `f78999e7f0713a738b6114c7b7ecf5d22736b815ca4ab1c1f86bb174e3a7a881` |
| `images/hnphotos-06.jpg` | 1769×1292 | 593,894 | 1769×1292 | 266,829 | `8bd1b47e88b47da00e7eab9c3e025762b89727f9c0be9ccdcab8ec87b3901dfa` |
| `images/hnphotos-07.jpg` | 2779×1292 | 1,198,089 | 2048×952 | 334,790 | `94de4c6f50f42b76d98780403f856f1f3ef9d97ead62ef31d94081b15ee41464` |
| `images/hnphotos-08.jpg` | 2277×1292 | 765,067 | 2048×1162 | 290,358 | `24d0e5de006f04dc9db042f4074ac3dfafebd57f710769d26289a0f1e398db40` |
| `images/hnphotos-09.jpg` | 2779×1292 | 1,156,926 | 2048×952 | 319,879 | `c885396421a240109a554d904a6cfb803215351849720f24dc00fd45aa99a487` |
| `images/hnphotos-10.jpg` | 2779×1292 | 1,258,877 | 2048×952 | 330,033 | `96a25caa92e70fab7d72fcad44823c58511c6979d03181caedca1d0ddf70a2f9` |
| `images/hnphotos-11.jpg` | 2779×1292 | 603,790 | 2048×952 | 152,267 | `d31724f17690d203a1e8b2c83d41b1cad2a0e7bc25e6b0d2009c0e92028bf9f2` |
| `images/hnphotos-12.jpg` | 2779×1292 | 1,261,999 | 2048×952 | 339,291 | `3750dcbc5b85d9306ae43e3273bb762031bd5d64f8cbefe5ad39c96d7819546b` |
| `images/hnphotos-13.jpg` | 2779×1292 | 814,410 | 2048×952 | 233,321 | `7f29e5a9f20a7460c018642a8a865faa369dddf5167b2dc295a975b8647bc270` |
| `images/hnphotos-14.jpg` | 1329×1292 | 638,965 | 1329×1292 | 301,439 | `46cdcd286bdfae6bbd2bc3caf83fb40368dbd9537cc4e90aa91f74e32ac0f94b` |
| `images/hnwinners.jpg` | 1980×1080 | 855,310 | 1980×1080 | 404,876 | `085068a4ded4440e761f60bbea37292ab46e01165d9db664e33cc89a2986b6ff` |
| `images/lanceandteam.jpg` | 1920×732 | 264,990 | 1920×732 | 205,229 | `56301223e5ae8cda9430db914fb49f1a0db13940d75498902854a9e346a4c493` |
| `images/lancielaughing.jpg` | 1920×1280 | 1,043,652 | 1920×1280 | 243,806 | `ecc11126ca4bb19f2ee9adaac699cfb6c0a5eaeabcd41032b69f0b8cd835bf05` |
| `images/lookinginterested.jpg` | 1464×967 | 265,555 | 1464×967 | 204,293 | `20462d853a9ba41921a9b6d6f30634a6d3e3ca9cea987790c769482145d98c4a` |
| `images/megan.jpg` | 2560×1868 | 2,362,044 | 2048×1494 | 412,484 | `15f863a95660f9d77e92c771e9a6608bf993a4bf42ccb84230ed9a1ba18b4ea1` |
| `images/mikeexplaining.jpg` | 3329×1981 | 1,419,080 | 2048×1219 | 395,427 | `07321655af08729246b50de1ca8454f6bd789ec56e153bc2e31d513f353fa059` |
| `images/participants.jpeg` | 6000×4000 | 8,471,706 | 2048×1365 | 310,469 | `3ae77a73e27ff7b26d08049ded703d657bb3841fa7e957558e4fbf6a23b98761` |
| `images/participants2.jpeg` | 6000×3666 | 3,404,120 | 2048×1251 | 330,027 | `823ee55bd3fcb1d6afb66409d3252472c711306b07b279597991c9dec2a7046f` |
| `images/Skeep.JPG` | 5332×4000 | 2,573,072 | 2048×1536 | 354,910 | `b36fd89fd791da92a891961adc7ec3ee1585a086ba6bef3c4a222dff005dd33c` |
| `images/stallwart.JPG` | 3908×3689 | 1,237,636 | 2048×1933 | 244,633 | `ea8062d88aadc925b31a7a460509660b8fdfea0f0a0dfbfdadb7dbb185aad472` |
| `images/stallwart2.JPG` | 3806×3798 | 2,174,898 | 2048×2044 | 441,603 | `972d55c63b50b9e445f5f8ecadf89cd7ca4377b70c68a7001551d5bb92537f59` |
| `images/stallwart3.JPG` | 6000×4000 | 8,415,803 | 2048×1365 | 298,121 | `18cb40325fb36cce6e9b87bb9b9d52f23afd0484d447e57e337acbd6bfb73f9f` |
| `images/teamspace.jpg` | 1920×1280 | 980,622 | 1920×1280 | 223,282 | `18c2a7cf84d9d609fa28cf6e235dd8ef7933939b5db9eb8d6c78f0555c1ee518` |
| `images/venkatandteam.jpg` | 1920×1280 | 1,160,493 | 1920×1280 | 276,021 | `76e2a4df3951f6d9e6650888cf1e89cbb4fea37c8b61c2b5a587827665b7f676` |
| `images/Water Watch.JPG` | 2791×3495 | 1,422,751 | 1635×2048 | 349,305 | `d2f1164140e88c7e7c38abefc51425ff090e50b65ebb59efc026db708ec8bcfc` |
| `images/waterwatch2.JPG` | 6000×4000 | 8,472,187 | 2048×1365 | 380,622 | `69b9b51e394ab30c46df4f1b44fd7c4037364f03d929b7495c2aa95c3a4c221b` |
| `images/webphoto1.JPG` | 6000×4000 | 804,496 | 2048×1365 | 278,044 | `f0749c4e42771e257a39050c30271703f934aaea6a104338bf3cead66027bef1` |
| `images/webphoto2.JPG` | 6000×2944 | 908,697 | 2048×1005 | 296,013 | `d2085fe010041798e2eba0ca02118debbdd90911fda46944479bfa596e4c8c2e` |

## Event archive additions

These photos were added to the HarborHack 2023 and Innovation Engine archives and replaced under the same filenames. Each cleaned full-resolution original stays in Git history at commit `f53961cd9acc906c51ee421e00ae2842d2d82f6a`.

Restore one original:

```sh
git restore --source=f53961cd9acc906c51ee421e00ae2842d2d82f6a -- "images/hm4.jpeg"
```

Settings: longest edge 2048px, JPEG quality 82, progressive, orientation applied to the pixels, ICC profile kept. The capture date is the only metadata kept.

| File | Archive | Original | Original size | New | New size | Original SHA-256 |
|---|---|---|---:|---|---:|---|
| `images/Aiden.JPG` | HarborHack 2023 | 5583×2299 | 1,763,893 | 2048×843 | 215,565 | `26ee31e3cf31e23bf02c02ff08e26c63de1362e189703ce7cd762859d4f9147d` |
| `images/The team.JPG` | HarborHack 2023 | 6000×4000 | 8,103,185 | 2048×1365 | 348,461 | `51f62536f96c7d68c06ef79a09784b94068417f338dd7cbf147ba3b833ee82cc` |
| `images/Balcony.JPG` | HarborHack 2023 | 6000×4000 | 7,513,147 | 2048×1365 | 365,527 | `749d3a720fb9fef46b320f9cc70106c74a8890a521db5e95d89e18595a3eacf8` |
| `images/willlancie.JPG` | HarborHack 2023 | 4314×3592 | 2,042,293 | 2048×1705 | 325,506 | `30bb5eb993d8645fea52ce9c1fb9f2f44fce1e03a22aac9b3753323eccdfd2a9` |
| `images/Venkat.JPG` | HarborHack 2023 | 6000×4000 | 7,918,736 | 2048×1365 | 298,750 | `3527b1c8816a441cdb4dd0d192b9c60a10fa33815b5e5516e2efeb1a755240a2` |
| `images/judges.JPG` | HarborHack 2023 | 6000×4000 | 7,672,231 | 2048×1365 | 228,704 | `11fcf74c27f102c4a155a8cef92a50b2d87136de36de0bdeaeaec177c7877240` |
| `images/conservancy2.jpeg` | Innovation Engine | 4284×5712 | 4,985,236 | 1536×2048 | 458,243 | `21a4a889b0935ceac8fbda9a227e4bd18c0e2dfdba6d678b1ed59b763fdb1cd5` |
| `images/conservancy3.jpeg` | Innovation Engine | 4032×3024 | 2,675,972 | 2048×1536 | 503,872 | `570cc4b5b5eace86faca0738fbdb4ddd4282092477f21b6dfd3e463e4d50304b` |
| `images/hm4.jpeg` | Innovation Engine | 5712×4284 | 5,393,342 | 2048×1536 | 512,383 | `5c82edfe21e11b032017b8776489f6ca13cb2f4e0583e5a0a5f1352e3752e2ac` |

## Used media optimization

These files were replaced under the same filenames. Each previous version stays in Git history at commit `3f8e27aa0f3030695514d041fe90a35505bdeef2`.

Restore one original:

```sh
git restore --source=3f8e27aa0f3030695514d041fe90a35505bdeef2 -- "images/ieteam.jpg"
```

Settings: JPEG photos have a longest edge of 2048px at quality 82, with orientation applied to the pixels and only the capture date kept as metadata. WebP photos keep their dimensions at quality 86. PNG files are lossless, with identical pixels. A file was replaced only if it saved at least 20%, or 5% for PNG. HDR photos and catalog posters were left unchanged.

| File | Original | Original size | New | New size | Original SHA-256 |
|---|---|---:|---|---:|---|
| `images/Anya.jpg` | 4000×1868 | 1,352,098 | 2048×956 | 257,491 | `4b08bd2265d01b42057991cc8b0ce8c0653c423ba72955d4923db982d36ddddb` |
| `images/firstplace.jpg` | 3024×4032 | 2,493,384 | 1536×2048 | 436,714 | `6ba1f9d690aae5c1b7928c8dffc7592b93e0736b2db0459aa697f04dd9688da5` |
| `images/geoff.jpg` | 1868×4000 | 1,952,437 | 956×2048 | 302,401 | `05309f1f6649ac61dd98142770f948817fe36c492c8c4a268800a25bb6dedf58` |
| `images/Harborwalk.jpg` | 4000×1868 | 1,843,810 | 2048×956 | 253,275 | `6f0ca53d06fb532def504b7ddb2afdf1da8e62f44528a052ccf3f8a998ff366e` |
| `images/hm1.jpg` | 1440×1440 | 636,093 | 1440×1440 | 314,788 | `394ba474fa1278c8a9f570589535dbbd459d471f1cb7febc329e3743483773a1` |
| `images/hm3.jpg` | 1440×1440 | 577,591 | 1440×1440 | 269,136 | `0219c1c275d1612d465fc4d60a8935e4af983feb8621a8c5e672eff3bb55c164` |
| `images/Home Bridge.jpg` | 4000×1868 | 1,709,919 | 2048×956 | 202,611 | `6ca347a5d22a9547a0a586c70be704710eaeafb31a2361c33759f5d8e2c643f3` |
| `images/ieteam.jpg` | 5712×4284 | 4,917,135 | 2048×1536 | 471,623 | `4bcef110662bf08b80499e17fa006969902e8b99655f3961ff5345da4d21fb36` |
| `images/Judges Good.jpg` | 4000×1868 | 968,618 | 2048×956 | 227,924 | `81cfc7988c85ece96fde2ed7a6fd1b2a7335f287c44fdbbe4697ca0e013e4142` |
| `images/Make it Real.png` | 2738×2739 | 2,308,573 | 2738×2739 | 2,115,932 | `a5f4f5bbc0108f39fb9d6c8aa8a6fce4cda7bd24d5cf3443856075e1d15c8c3c` |
| `images/secondplace.jpg` | 4000×2252 | 2,009,374 | 2048×1153 | 318,550 | `ef4f043686d6b0c34ac0029f5ca58d124711d429d9a9485e2c03af4aaa06fe9d` |
| `images/squarebanner.jpg` | 5100×5100 | 808,513 | 2048×2048 | 436,066 | `3d736c36f02663b24efe208a56554af647e47f3a498ca7a2557c1e7e6462acff` |
| `images/st1.webp` | 1206×2111 | 1,106,050 | 1206×2111 | 65,186 | `52141d32bf8d7c400dac7931cb5d147ef21351ae8d4453515308e5c9e4ace5d0` |
| `images/st2.webp` | 1206×1579 | 1,575,888 | 1206×1579 | 162,558 | `caa5a928832064895c978bbaa3968549a585d2bf7dc63c67edc1fd2e992bece6` |
| `images/st3.webp` | 1206×2084 | 1,344,370 | 1206×2084 | 109,596 | `a549f3a948044de9008675cd13acd6f4b4b1f9312a367052a52817a3f6a54adc` |
| `images/st4.webp` | 1206×2119 | 1,468,510 | 1206×2119 | 111,412 | `db00437538b06acab2ff4f8e2af7e19e021d3f7694e1c47a35fc562083efcd9c` |
| `images/st5.webp` | 1206×1715 | 1,809,732 | 1206×1715 | 169,788 | `bf60ab57e06aa5b00ed9bbe1df20cf4074570e4cff1e5a6545facf225f045848` |
| `images/Team photo.jpg` | 4000×1868 | 1,747,754 | 2048×956 | 165,680 | `b9d12e2216295b121273fb30e28566c677d1ebde05ce6f71592cd52f09682cf0` |
| `images/tejas.jpg` | 1440×1440 | 714,307 | 1440×1440 | 347,458 | `c2e88014d3f6e618f352c3cc95752759a973023749850f238710fb2aae76f65a` |
| `images/wizard.JPG` | 4480×6720 | 7,731,802 | 1365×2048 | 299,035 | `b7a82af013783388f1e36a53082570799822e5053723aeb685be3bd71847bd47` |

## Media manifest

`docs/reference/media-manifest.csv` lists every media file with its size, references, event and status. It records repository references only, so "no reference" does not mean a file is safe to remove.

| Status | Meaning |
|---|---|
| `used` | Referenced by a page or script reachable from the site |
| `used-on-unlinked-page` | Referenced by a page with no link from the homepage |
| `associated-not-displayed` | Strong evidence for one event, not shown on a page |
| `alternate-version` | Another version or copy of a file |
| `brand-or-interface` | Logo, game, button or background art, not event media |
| `unresolved` | Event or use not established |

### Maintaining the inventory

Run `python3 scripts/check_media_manifest.py` from the checkout (or invoke it by absolute path). It uses tracked files in the working tree, including staged additions, to check coverage, duplicate entries, missing/untracked files, and recorded byte sizes. Its format list includes images, video, audio (including M4A), and PDFs; fonts and base64 source copies are not inventory media. Extend the explicit format list when introducing another format. Stage a newly added asset before checking coverage.

For existing media whose bytes changed, `python3 scripts/check_media_manifest.py --refresh-sizes` refreshes only `size_bytes`, refusing structural problems such as missing or unlisted files. It preserves row order and all curated fields. It does not infer event associations, update dimensions, alter references, or add/delete rows. Review the CSV diff after refreshing. Dimensions must be updated explicitly when resizing or rotating an image, and references must be updated when code or styles move.

New media needs an explicit record with its actual format, size and dimensions (when applicable), references, and supporting evidence. Mark uncertain associations unresolved. The five M4A audio records added during the stylesheet maintenance pass were previously omitted from the inventory; no audio was changed.

References and reachability are evidence requiring maintenance, not a guarantee of usage: JavaScript can construct paths, and email, database records, or external sites can use direct URLs. A passing checker does not establish visual quality, metadata removal, or permission to delete anything. Preserve high-confidence event mappings, confidence, evidence, and notes when editing machine-derived fields.

Test the checker with `python3 -m unittest discover -s tests -p 'test_media_manifest.py'`. No external Python packages are required.
