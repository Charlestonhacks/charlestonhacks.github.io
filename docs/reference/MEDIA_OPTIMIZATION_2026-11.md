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
