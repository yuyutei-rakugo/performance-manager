// Public venue address and position references, checked 2026-11-24.
const locations=new Map([
 ["神栖市／丸竹",{"aliases":["丸竹鮮魚店","マルタケ鮮魚店"],"address":"茨城県神栖市土合本町3丁目9809-267","lat":35.79461386,"lng":140.77759256,"source":"https://www.mapion.co.jp/phonebook/M02014/08232/20830199416/","confirmedLinks":["https://maps.app.goo.gl/g2AV4mKkUri1t9MS9","https://maps.app.goo.gl/17Sgq87wKKxGt7vj8"]}],
 ["神栖市／若松郵便局",{"address":"茨城県神栖市須田2340-127","lat":35.8391608,"lng":140.7424836,"source":"https://map.japanpost.jp/p/search/dtl/300106211000/"}],
 ["神栖市／ゆ〜ぽ〜とはさき",{"address":"茨城県神栖市砂山15","lat":35.84034367508438,"lng":140.74115608122614,"source":"https://www.city.kamisu.ibaraki.jp/kanko_sports/ss_facility/1002393/1002408/1002411.html"}],
 ["銚子市／イオン銚子店",{"address":"千葉県銚子市三崎町2丁目2660-1","lat":35.710182,"lng":140.7876928,"source":"https://www.mapion.co.jp/phonebook/M02002/12202/ILSP0000682420_ipclm/"}],
 ["銚子市／公正図書館",{"address":"千葉県銚子市新生町2丁目1-5","lat":35.732391,"lng":140.8333304,"source":"https://mapfan.com/spots/SC3AC%2CJ%2C14W"}],
 ["神栖市／カスミ 波崎店",{"address":"茨城県神栖市波崎8473-3","lat":35.7497229,"lng":140.8231211,"source":"https://www.mapion.co.jp/phonebook/M02002/08232/20830198003/"}],
 ["神栖市／カスミ フードスクエアライフガーデン神栖店",{"address":"茨城県神栖市平泉8番76","lat":35.9155807,"lng":140.6398359,"source":"https://www.mapion.co.jp/phonebook/M02002/08232/ILSP0059274891_ipclm/"}],
 ["神栖市／神栖市文化センター",{"address":"茨城県神栖市溝口4991-4","lat":35.888841,"lng":140.668769,"source":"https://www.city.kamisu.ibaraki.jp/kodomo/cul_facility/1001871.html"}],
 ["神栖市／中央図書館",{"address":"茨城県神栖市大野原4丁目8-1","lat":35.897569,"lng":140.636617,"source":"https://www.city.kamisu.ibaraki.jp/kodomo/cul_facility/1001824/1001825/1001826.html"}],
 ["神栖市／うずも図書館",{"address":"茨城県神栖市知手中央7丁目1-6","lat":35.8737586,"lng":140.7050673,"source":"https://www.city.kamisu.ibaraki.jp/kodomo/cul_facility/1001824/1001825/1001827.html"}],
 ["銚子市／セブンイレブン 銚子愛宕店",{"address":"千葉県銚子市愛宕町3480","lat":35.725347,"lng":140.8515502,"source":"https://www.mapion.co.jp/phonebook/M02005/12202/ILSP0000479460_ipclm/"}],
 ["銚子市／セブンイレブン 銚子新生店",{"address":"千葉県銚子市新生町2-4-12","lat":35.731638,"lng":140.836151,"source":"https://www.mapion.co.jp/phonebook/M02005/12202/ILSP0000479452_ipclm/"}],
 ["銚子市／セブンイレブン 銚子笠上町店",{"address":"千葉県銚子市笠上町6074-2","lat":35.7311451,"lng":140.8569245,"source":"https://www.mapion.co.jp/phonebook/M02005/12202/ILSP0000479454_ipclm/"}],
 ["銚子市／セブンイレブン 銚子清川町店",{"address":"千葉県銚子市清川町4-5-1","lat":35.7255704,"lng":140.8201321,"source":"https://www.mapion.co.jp/phonebook/M02005/12202/ILSP0000479455_ipclm/"}],
 ["銚子市／セブンイレブン 銚子忍町店",{"address":"千葉県銚子市忍町52-7","lat":35.7804691,"lng":140.7376117,"source":"https://www.mapion.co.jp/phonebook/M02005/12202/ILSP0000479456_ipclm/"}],
 ["銚子市／セブンイレブン 銚子高神西町店",{"address":"千葉県銚子市高神西町3273-1","lat":35.7118651,"lng":140.8404618,"source":"https://www.mapion.co.jp/phonebook/M02005/12202/ILSP0000484643_ipclm/"}],
 ["銚子市／セブンイレブン 銚子豊里台店",{"address":"千葉県銚子市豊里台1-1044-37","lat":35.7898183,"lng":140.7117313,"source":"https://www.mapion.co.jp/phonebook/M02005/12202/ILSP0000479457_ipclm/"}],
 ["銚子市／セブンイレブン 銚子松岸店",{"address":"千葉県銚子市松岸町3-310","lat":35.7419104,"lng":140.7931522,"source":"https://www.mapion.co.jp/phonebook/M02005/12202/ILSP0000484644_ipclm/"}],
 ["銚子市／セブンイレブン 銚子本城町店",{"address":"千葉県銚子市本城町4丁目483-1","lat":35.735567,"lng":140.8089499,"source":"https://www.mapion.co.jp/phonebook/M02005/12202/ILSP0064317179_ipclm/"}],
 ["銚子市／セブンイレブン 銚子三崎町1丁目店",{"address":"千葉県銚子市三崎町1丁目75","lat":35.7213759,"lng":140.8058744,"source":"https://www.mapion.co.jp/phonebook/M02005/12202/ILSP0058259386_ipclm/"}],
 ["銚子市／セブンイレブン 銚子ドーバーライン店",{"address":"千葉県銚子市三崎町2-2599-1","lat":35.7135823,"lng":140.789573,"source":"https://www.mapion.co.jp/phonebook/M02005/12202/ILSP0059217810_ipclm/"}],
 ["銚子市／セブンイレブン 銚子中央町店",{"address":"千葉県銚子市中央町18番地4","lat":35.733566,"lng":140.8313081,"source":"https://www.mapion.co.jp/phonebook/M02005/12202/ILSP0060465726_ipclm/"}],
 ["銚子市／ファミリーマート 銚子川口町店",{"address":"千葉県銚子市川口町2-6524","lat":35.7358843,"lng":140.8631541,"source":"https://www.mapion.co.jp/phonebook/M02005/12202/ILSP0000511071_ipclm/"}],
 ["銚子市／ファミリーマート 銚子四日市場店",{"address":"千葉県銚子市四日市場町259","lat":35.7496773,"lng":140.7850221,"source":"https://www.mapion.co.jp/phonebook/M02005/12202/ILSP0000510418_ipclm/"}],
 ["銚子市／ファミリーマート 銚子駅前店",{"address":"千葉県銚子市西芝町14-19","lat":35.7300681,"lng":140.8278102,"source":"https://www.mapion.co.jp/phonebook/M02005/12202/ILSP0060466360_ipclm/"}],
 ["銚子市／ミニストップ 銚子小浜店",{"address":"千葉県銚子市小浜町2083","lat":35.7147655,"lng":140.7719388,"source":"https://www.mapion.co.jp/phonebook/M02005/12202/ILSP0000525185_ipclm/"}],
 ["銚子市／ローソン 銚子新生店",{"address":"千葉県銚子市新生町1-41-53","lat":35.7332862,"lng":140.8369748,"source":"https://www.mapion.co.jp/phonebook/M02005/12202/ILSP0000500579_ipclm/"}],
 ["銚子市／ローソン 銚子川口町店",{"address":"千葉県銚子市川口町2-6288","lat":35.7385633,"lng":140.8535298,"source":"https://www.mapion.co.jp/phonebook/M02005/12202/ILSP0000494548_ipclm/"}],
 ["銚子市／ローソン 銚子清川町店",{"address":"千葉県銚子市清川町2-6-8","lat":35.7273988,"lng":140.8223876,"source":"https://www.mapion.co.jp/phonebook/M02005/12202/ILSP0000494544_ipclm/"}],
 ["銚子市／ローソン 銚子小畑町店",{"address":"千葉県銚子市小畑町7342","lat":35.7157041,"lng":140.8567699,"source":"https://www.mapion.co.jp/phonebook/M02005/12202/ILSP0000499614_ipclm/"}],
 ["銚子市／ローソン 銚子本城町店",{"address":"千葉県銚子市本城町3-47-8","lat":35.7378705,"lng":140.8100694,"source":"https://www.mapion.co.jp/phonebook/M02005/12202/ILSP0000494546_ipclm/"}],
 ["銚子市／ローソン 銚子南小川町店",{"address":"千葉県銚子市南小川町760","lat":35.7206608,"lng":140.8352011,"source":"https://www.mapion.co.jp/phonebook/M02005/12202/ILSP0000494547_ipclm/"}],
 ["銚子市／ローソン 銚子長塚店",{"address":"千葉県銚子市長塚町6-4477-1","lat":35.7155242,"lng":140.787085,"source":"https://www.mapion.co.jp/phonebook/M02005/12202/ILSP0060857788_ipclm/"}],
 ["銚子市／ローソン 銚子小船木店",{"address":"千葉県銚子市小船木町1-322-1","lat":35.7701959,"lng":140.7501491,"source":"https://www.mapion.co.jp/phonebook/M02005/12202/ILSP0060730298_ipclm/"}],
 ["銚子市／カスミ 銚子松岸店",{"address":"千葉県銚子市松岸町3丁目216-1","lat":35.7434034,"lng":140.7941155,"source":"https://www.mapion.co.jp/phonebook/M02002/12202/21230110016/"}],
 ["銚子市／カスミ フードスクエア南小川店",{"address":"千葉県銚子市南小川町724番地","lat":35.7209861,"lng":140.835962,"source":"https://www.mapion.co.jp/phonebook/M02002/12202/ILSP0000678517_ipclm/"}],
 ["銚子市／セイミヤ 銚子四日市場店",{"address":"千葉県銚子市四日市場町221-1","lat":35.7489275,"lng":140.7870103,"source":"https://www.mapion.co.jp/phonebook/M02002/12202/21233002069/"}],
 ["銚子市／タイヨー 銚子店",{"address":"千葉県銚子市三軒町2-1","lat":35.7346664,"lng":140.8247522,"source":"https://www.mapion.co.jp/phonebook/M02002/12202/21230557826/"}],
 ["銚子市／フレッシュ マルトモ",{"address":"千葉県銚子市諸持町18-3","lat":35.7990561,"lng":140.7136255,"source":"https://www.mapion.co.jp/phonebook/M02002/12202/21233043835/"}],
 ["銚子市／コメリ 小畑店",{"address":"千葉県銚子市小畑新町7943-1","lat":35.7153537,"lng":140.8581338,"source":"https://www.mapion.co.jp/phonebook/M02003/12202/ILSP0000670937_ipclm/"}],
 ["銚子市／カインズホーム 銚子店",{"address":"千葉県銚子市芦崎町810","lat":35.7555491,"lng":140.7745177,"source":"https://map.cainz.com/detail/747/"}],
 ["銚子市／わくわく広場 銚子小畑町店",{"address":"千葉県銚子市小畑新町7731-1","lat":35.7204868,"lng":140.8544415,"source":"https://mapfan.com/spots/S5CAQ%2CEK6%2CIP98U0"}],
 ["銚子市／銚子市役所",{"address":"千葉県銚子市若宮町1-1","lat":35.7346732,"lng":140.8267964,"source":"https://wwwp.pref.chiba.lg.jp/pbbfmap/facility/1473"}],
 ["銚子市／豊里出張所",{"address":"千葉県銚子市笹本町359-1","lat":35.7940797,"lng":140.7187073,"source":"https://www.navita.co.jp/s/11083639/"}],
 ["銚子市／豊岡出張所",{"address":"千葉県銚子市八木町1763-6","lat":35.709046,"lng":140.74532,"source":"https://geoshape.ex.nii.ac.jp/city/resource/12B0050014.html"}],
 ["銚子市／しおさいプラザ",{"address":"千葉県銚子市三崎町2丁目2660-1 イオンモール銚子2階","lat":35.710182,"lng":140.7876928,"source":"https://www.city.choshi.chiba.jp/shisei/page010015.html"}],
 ["銚子市／銚子市市民センター",{"address":"千葉県銚子市小畑新町7756","lat":35.7208478,"lng":140.8566518,"source":"https://www.city.choshi.chiba.jp/edu/sg-guide/page210019.html"}],
 ["銚子市／保健福祉センターすこやかなまなびの城",{"address":"千葉県銚子市若宮町4-8","lat":35.7336703,"lng":140.8270385,"source":"https://wwwp.pref.chiba.lg.jp/pbbfmap/facility/1491"}],
 ["神栖市／セブンイレブン 神栖須田店",{"address":"茨城県神栖市須田2304-78","lat":35.8401467,"lng":140.7446452,"source":"https://www.mapion.co.jp/phonebook/M02005/08232/ILSP0000485415_ipclm/"}],
 ["神栖市／セブンイレブン 神栖太田店",{"address":"茨城県神栖市太田456-41","lat":35.8297588,"lng":140.7220315,"source":"https://www.mapion.co.jp/phonebook/M02005/08232/ILSP0056229113_ipclm/"}],
 ["神栖市／セブンイレブン 波崎植松店",{"address":"茨城県神栖市矢田部9445番14","lat":35.8016148,"lng":140.7823836,"source":"https://www.mapion.co.jp/phonebook/M02005/08232/ILSP0000485416_ipclm/"}],
 ["神栖市／セブンイレブン 神栖矢田部店",{"address":"茨城県神栖市矢田部6381","lat":35.7910674,"lng":140.7603774,"source":"https://www.mapion.co.jp/phonebook/M02005/08232/ILSP0083549560_ipclm/"}],
 ["神栖市／セブンイレブン 波崎土合南店",{"address":"茨城県神栖市土合南1-2-9","lat":35.786574,"lng":140.7776395,"source":"https://www.mapion.co.jp/phonebook/M02005/08232/ILSP0000478277_ipclm/"}],
 ["神栖市／セブンイレブン 茨城波崎本郷店",{"address":"茨城県神栖市波崎6395-3","lat":35.7550344,"lng":140.810111,"source":"https://www.mapion.co.jp/phonebook/M02005/08232/ILSP0000478276_ipclm/"}],
 ["神栖市／セブンイレブン 波崎海岸店",{"address":"茨城県神栖市波崎8810-5","lat":35.7509013,"lng":140.8294965,"source":"https://www.mapion.co.jp/phonebook/M02005/08232/ILSP0000478275_ipclm/"}],
 ["神栖市／ファミリーマート 神栖若松店",{"address":"茨城県神栖市若松中央2-30","lat":35.8358908,"lng":140.7357574,"source":"https://www.mapion.co.jp/phonebook/M02005/08232/ILSP0000511005_ipclm/"}],
 ["神栖市／ファミリーマート 神栖土合本町店",{"address":"茨城県神栖市土合本町5丁目9809番24","lat":35.7988623,"lng":140.7793002,"source":"https://www.mapion.co.jp/phonebook/M02005/08232/ILSP0056913140_ipclm/"}],
 ["神栖市／ファミリーマート 神栖波崎小玉台店",{"address":"茨城県神栖市波崎6587番1","lat":35.7592419,"lng":140.813853,"source":"https://www.mapion.co.jp/phonebook/M02005/08232/ILSP0057257730_ipclm/"}],
 ["神栖市／ローソン 神栖若松中央店",{"address":"茨城県神栖市若松中央2-108","lat":35.8349452,"lng":140.7335364,"source":"https://www.mapion.co.jp/phonebook/M02005/08232/ILSP0059218081_ipclm/"}],
 ["神栖市／ローソン 神栖太田店",{"address":"茨城県神栖市太田603-14","lat":35.8392394,"lng":140.7144782,"source":"https://www.mapion.co.jp/phonebook/M02005/08232/ILSP0060179392_ipclm/"}],
 ["神栖市／ローソン 波崎別所店",{"address":"茨城県神栖市波崎4676-7","lat":35.7598967,"lng":140.7982998,"source":"https://www.mapion.co.jp/phonebook/M02005/08232/ILSP0000500514_ipclm/"}],
 ["神栖市／ローソン 神栖波崎浜新田店",{"address":"茨城県神栖市波崎8246-2","lat":35.7514219,"lng":140.8245696,"source":"https://www.mapion.co.jp/phonebook/M02005/08232/ILSP0059674001_ipclm/"}],
 ["神栖市／ミニストップ 波崎宝山店",{"address":"茨城県神栖市太田4644","lat":35.8441154,"lng":140.711682,"source":"https://map.ministop.co.jp/detail/0000000739/"}],
 ["神栖市／ミニストップ 波崎砂山店",{"address":"茨城県神栖市砂山1014番193","lat":35.8648132,"lng":140.7111574,"source":"https://www.mapion.co.jp/phonebook/M02005/08232/ILSP0000523915_ipclm/"}],
 ["神栖市／セブンイレブン 神栖息栖店",{"address":"茨城県神栖市大野原中央3-8-17","lat":35.8907564,"lng":140.6329784,"source":"https://www.mapion.co.jp/phonebook/M02005/08232/ILSP0000478261_ipclm/"}],
 ["神栖市／セブンイレブン 神栖知手店",{"address":"茨城県神栖市知手中央3-8-3","lat":35.8817576,"lng":140.7112265,"source":"https://www.mapion.co.jp/phonebook/M02005/08232/ILSP0000478271_ipclm/"}],
 ["神栖市／セブンイレブン 神栖平泉店",{"address":"茨城県神栖市平泉2123-11","lat":35.9125697,"lng":140.6445824,"source":"https://www.mapion.co.jp/phonebook/M02005/08232/ILSP0058568083_ipclm/"}],
 ["神栖市／ファミリーマート 神栖深芝店",{"address":"茨城県神栖市深芝字若松2604-1他5筆","lat":35.9161382,"lng":140.6509694,"source":"https://www.mapion.co.jp/phonebook/M02005/08232/ILSP0058719415_ipclm/"}],
 ["神栖市／ファミリーマート 神栖筒井店",{"address":"茨城県神栖市筒井1422-13","lat":35.9036787,"lng":140.6287374,"source":"https://www.mapion.co.jp/phonebook/M02005/08232/ILSP0000510365_ipclm/"}],
 ["神栖市／ローソン 神栖二丁目店",{"address":"茨城県神栖市神栖2-7-24","lat":35.9012441,"lng":140.6487145,"source":"https://www.mapion.co.jp/phonebook/M02005/08232/ILSP0059905129_ipclm/"}],
 ["神栖市／ローソン 神栖知手東店",{"address":"茨城県神栖市知手2974-323","lat":35.8699908,"lng":140.6919839,"source":"https://dpoint.docomo.ne.jp/map/7780_89632/"}],
 ["神栖市／ミニストップ 神栖日川店",{"address":"茨城県神栖市日川字日向235","lat":35.867176,"lng":140.6799405,"source":"https://www.mapion.co.jp/phonebook/M02005/08232/ILSP0000523913_ipclm/"}],
 ["神栖市／カスミ 神栖店",{"address":"茨城県神栖市大野原4丁目1-41","lat":35.8972181,"lng":140.6413442,"source":"https://www.mapion.co.jp/phonebook/M02002/08232/20830161212/"}],
 ["神栖市／セイミヤ 神栖店",{"address":"茨城県神栖市平泉1-118","lat":35.9123775,"lng":140.6408853,"source":"https://www.mapion.co.jp/phonebook/M02002/08232/20830159031/"}],
 ["神栖市／スーパータイヨー オークビレッジ店",{"address":"茨城県神栖市大野原4丁目8-71-5","lat":35.8992653,"lng":140.6364794,"source":"https://www.openstreetmap.org/node/11224575561"}],
 ["神栖市／スーパータイヨー 神栖店",{"address":"茨城県神栖市大野原2丁目31-31","lat":35.8965933,"lng":140.6459688,"source":"https://www.mapion.co.jp/phonebook/M02002/08232/20830160886/"}],
 ["神栖市／スーパータイヨー 知手店",{"address":"茨城県神栖市知手3420-57","lat":35.8825495,"lng":140.7155607,"source":"https://www.mapion.co.jp/phonebook/M02002/08232/20830157848/"}],
 ["神栖市／フーズマーケットさえき 知手店",{"address":"茨城県神栖市知手中央2丁目3-27","lat":35.881371,"lng":140.708161,"source":"https://hk.freshsaeki.co.jp/store/shitte"}],
 ["神栖市／カスミ 土合店",{"address":"茨城県神栖市土合西1丁目2-5","lat":35.7930342,"lng":140.7713797,"source":"https://www.kasumi.co.jp/tenpotop/ibaraki-rokko/kamisu/331/"}],
 ["神栖市／スーパータイヨー フーデリア店",{"address":"茨城県神栖市土合本町4丁目9809-344","lat":35.7959416,"lng":140.7794313,"source":"https://www.mapion.co.jp/phonebook/M02002/08232/20830268741/"}],
 ["神栖市／スーパータイヨー 波崎店",{"address":"茨城県神栖市波崎7384-1","lat":35.751928,"lng":140.8156189,"source":"https://www.mapion.co.jp/phonebook/M02002/08232/20830197896/"}],
 ["神栖市／ウエルシア 神栖土合本町店",{"address":"茨城県神栖市土合本町4丁目9809-451","lat":35.7940015,"lng":140.7737353,"source":"https://mapfan.com/spots/A%2C35.7940015275%2C140.773735335%2C%E8%8C%A8%E5%9F%8E%E7%9C%8C%E7%A5%9E%E6%A0%96%E5%B8%82%E5%9C%9F%E5%90%88%E6%9C%AC%E7%94%BA%EF%BC%94%EF%BC%8D%EF%BC%99%EF%BC%98%EF%BC%90%EF%BC%99%EF%BC%8D%EF%BC%94%EF%BC%95%EF%BC%91%2C"}],
 ["神栖市／波崎総合支所・防災センター",{"address":"茨城県神栖市波崎6530","lat":35.7567922,"lng":140.8138149,"source":"https://www.city.kamisu.ibaraki.jp/shisei/p_facility/1002954/1002955/1002958.html"}],
 ["神栖市／矢田部公民館",{"address":"茨城県神栖市土合本町3丁目9809-15","lat":35.7939136,"lng":140.7767199,"source":"https://www.city.kamisu.ibaraki.jp/shisei/p_facility/1002954/1002982/1002985.html"}],
 ["神栖市／若松公民館",{"address":"茨城県神栖市砂山15","lat":35.8392478,"lng":140.7389886,"source":"https://www.city.kamisu.ibaraki.jp/shisei/p_facility/1002954/1002982/1002986.html"}],
 ["神栖市／はさき生涯学習センター",{"address":"茨城県神栖市波崎9591","lat":35.7518584,"lng":140.8300711,"source":"https://www.city.kamisu.ibaraki.jp/kodomo/cul_facility/1012447/1012457.html"}],
 ["神栖市／波崎東ふれあいセンター",{"address":"茨城県神栖市波崎9572-1","lat":35.7474639,"lng":140.8345065,"source":"https://www.city.kamisu.ibaraki.jp/shisei/p_facility/1002954/1002982/1002994.html"}],
 ["神栖市／土合体育館",{"address":"茨城県神栖市土合北1丁目7-60","lat":35.792439,"lng":140.7858089,"source":"https://www.city.kamisu.ibaraki.jp/kanko_sports/ss_facility/1003993/1003995/1002499.html"}],
 ["神栖市／矢田部ふれあい館",{"address":"茨城県神栖市矢田部6515","lat":35.7888672,"lng":140.7575875,"source":"https://www.city.kamisu.ibaraki.jp/shisei/p_facility/1002954/1002982/1008670.html"}],
 ["神栖市／はさき保健・交流センター",{"address":"茨城県神栖市土合本町1丁目8762-11","lat":35.7887444,"lng":140.7836438,"source":"https://www.city.kamisu.ibaraki.jp/iryo_fks/ho_facility/1010349.html"}],
 ["神栖市／神栖市役所本庁舎",{"address":"茨城県神栖市溝口4991-5","lat":35.889981,"lng":140.664522,"source":"https://www.city.kamisu.ibaraki.jp/shisei/p_facility/1002954/1002955/1002956.html"}],
 ["神栖市／中央公民館",{"address":"茨城県神栖市溝口4991-4","lat":35.8885721,"lng":140.6691654,"source":"https://www.city.kamisu.ibaraki.jp/kodomo/cul_facility/1001834/1001837.html"}],
 ["神栖市／かみす防災アリーナ",{"address":"茨城県神栖市木崎1219-7","lat":35.898918,"lng":140.649985,"source":"https://www.city.kamisu.ibaraki.jp/kanko_sports/ss_facility/1003993/1003994/1002488.html"}],
 ["神栖市／平泉コミュニティセンター",{"address":"茨城県神栖市平泉2751-2","lat":35.9061329,"lng":140.6346087,"source":"https://www.city.kamisu.ibaraki.jp/shisei/p_facility/1002954/1002982/1002993.html"}],
 ["神栖市／大野原コミュニティセンター",{"address":"茨城県神栖市大野原7丁目5-59","lat":35.8897347,"lng":140.6446705,"source":"https://www.city.kamisu.ibaraki.jp/shisei/p_facility/1002954/1002982/1002991.html"}],
 ["神栖市／歴史民俗資料館",{"address":"茨城県神栖市大野原4丁目8-5","lat":35.8971019,"lng":140.6364997,"source":"https://www.city.kamisu.ibaraki.jp/kanko_sports/ss_facility/1002393/1002394/1002396.html"}],
 ["神栖市／息栖にぎわいテラス",{"address":"茨城県神栖市息栖2509","lat":35.8849663,"lng":140.6223912,"source":"https://www.city.kamisu.ibaraki.jp/kanko_sports/ss_facility/1002393/1002394/1013254.html"}]
]);

export function flyerLocationInfo(row){
 const reference=locations.get(row.region+'／'+row.name);
 if(row.location===undefined)return reference;
 const saved=row.location;
 // Explicit removal, changed addresses and manually selected pins always win.
 if(!saved||!reference||Number.isFinite(saved.lat)||Number.isFinite(saved.lng))return saved;
 const addressMatches=!!saved.address&&normalizeLocationAddress(saved.address)===normalizeLocationAddress(reference.address);
 let confirmedLink=false;
 if(!saved.address&&reference.confirmedLinks){
  try{const url=new URL(saved.mapUrl);confirmedLink=reference.confirmedLinks.includes(url.origin+url.pathname)}catch{}
 }
 if(!addressMatches&&!confirmedLink)return saved;
 // A coordinate-bearing link can designate a different entrance; never replace it.
 try{if(positionFromUrl(saved.mapUrl))return saved}catch{return saved}
 return {...reference,...saved,address:saved.address||reference.address,lat:reference.lat,lng:reference.lng};
}
export function flyerLocation(row){
 const saved=flyerLocationInfo(row);
 if(Number.isFinite(saved?.lat)&&Number.isFinite(saved?.lng)&&Math.abs(saved.lat)<=90&&Math.abs(saved.lng)<=180)return [saved.lat,saved.lng];
 try{return positionFromUrl(saved?.mapUrl)}catch{return undefined}
}
export function positionFromUrl(value){
 if(!value)return;
 let url;
 try{url=new URL(value)}catch{throw Error('地図URLの形式を確認してください。')}
 if(url.protocol!=='https:')throw Error('地図URLはhttpsで始めてください。');
 const google=['google.com','www.google.com','maps.google.com','google.co.jp','www.google.co.jp','maps.google.co.jp'].includes(url.hostname);
 const osm=['openstreetmap.org','www.openstreetmap.org'].includes(url.hostname);
 const query=osm&&url.searchParams.has('mlat')&&url.searchParams.has('mlon')
  ?url.searchParams.get('mlat')+','+url.searchParams.get('mlon')
  :google&&(url.searchParams.get('query')||url.searchParams.get('q'));
 const marker=typeof query==='string'&&query.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
 const place=google&&url.pathname.startsWith('/maps/place/')&&url.pathname.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
 const coordinates=marker||place;
 if(coordinates&&Math.abs(Number(coordinates[1]))<=90&&Math.abs(Number(coordinates[2]))<=180)return coordinates.slice(1).map(Number);
}

export const normalizeLocationAddress=value=>String(value||'').normalize('NFKC')
  .replace(/^〒?\s*\d{3}[-‐－]?\d{4}\s*/,'')
  .replace(/([一二三四五六七八九十]+)丁目/g,(_,n)=>{
   const digits='〇一二三四五六七八九';
   const parts=n.split('十');
   return (parts.length===1?digits.indexOf(n):(parts[0]?digits.indexOf(parts[0]):1)*10+(parts[1]?digits.indexOf(parts[1]):0))+'-';
  })
  .replace(/丁目|番地の?|番(?!地)/g,'-').replace(/[−‐－]/g,'-').replace(/\s/g,'').replace(/[-号]$/,'');

export function confirmedGoogleShare(raw,region){
 const url=new URL(raw);
 const link=url.origin+url.pathname;
 const entries=[...locations].filter(([key,position])=>key.startsWith(region+'／')&&position.confirmedLinks?.includes(link));
 if(entries.length!==1)return;
 const [[name,position]]=entries;
 return {name:name.slice(region.length+1),...position};
}

export function googleSharePreview(raw){
 const url=new URL(raw);
 if(url.protocol!=='https:'||url.username||url.password||url.port)throw Error('Googleマップの共有リンクを入れてください。');
 if(['maps.app.goo.gl','goo.gl'].includes(url.hostname))throw Error('短縮リンクは共通保存の更新後に確認できます。地図で位置を指定できます。');
 if(!/^(?:(?:www|maps)\.)?google\.(?:com|co\.jp)$/.test(url.hostname))throw Error('Googleマップの共有リンクを入れてください。');
 const path=decodeURIComponent(url.pathname);
 const place=path.match(/^\/maps\/place\/([^/]+)/);
 const coordinates=place?[...path.matchAll(/!8m2!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)(?=!|$)/g)]:[];
 const explicitQuery=!url.searchParams.has('query_place_id')&&/^(?:\/|\/maps(?:\/search)?\/?)$/.test(path)&&
  (url.searchParams.get('query')||url.searchParams.get('q')||'').match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
 const xy=coordinates.length===1?coordinates[0]:explicitQuery;
 const label=place?.[1].replace(/\+/g,' ')||'';
 const labelledAddress=label.normalize('NFKC').match(/^(?:〒\s*)?\d{3}-\d{4}\s+((?:東京都|北海道|[^\s]+?[県府])[^\s]*\d)\s+(.+)$/);
 const name=labelledAddress?.[2]||label;
 return {name:/^[-+0-9.,°'" NSEW]+$/i.test(name)?'':name.slice(0,120),address:labelledAddress?.[1].slice(0,250)||'',...(xy&&Math.abs(Number(xy[1]))<=90&&Math.abs(Number(xy[2]))<=180?{lat:Number(xy[1]),lng:Number(xy[2])}:{})};
}

export function exactAddressPosition(address,features){
 const exact=features.filter(feature=>normalizeLocationAddress(feature.properties?.title)===normalizeLocationAddress(address));
 const xy=exact.length===1&&exact[0].geometry?.coordinates;
 if(Array.isArray(xy)&&xy.length===2&&xy.every(Number.isFinite)&&Math.abs(xy[0])<=180&&Math.abs(xy[1])<=90)return [xy[1],xy[0]];
}

export function flyerSearchUrl(row){
 const address=flyerLocationInfo(row)?.address;
 return 'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent([row.name,row.region,address].filter(Boolean).join(' '));
}

export function approximateAddressPosition(address,region,features){
 const compact=normalizeLocationAddress;
 const city=compact(region);
 const input=compact(address);
 if(!city||!input.includes(city)||input.endsWith(city)||!Array.isArray(features))return;
 const exact=exactAddressPosition(address,features);
 if(exact)return exact;
 const candidates=features.filter(feature=>{
  const title=compact(String(feature.properties?.title||''));
  const district=title.split(city)[1];
  const fromCity=input.slice(input.indexOf(city));
  const candidate=district&&city+district;
  return candidate&&district.length>=2&&fromCity.startsWith(candidate)&&(!fromCity.slice(candidate.length)||(/\d$/.test(candidate)?/^[-]/.test(fromCity.slice(candidate.length)):/^\d/.test(fromCity.slice(candidate.length))));
 });
 if(candidates.length!==1)return;
 const xy=candidates[0].geometry?.coordinates;
 if(Array.isArray(xy)&&xy.length===2&&xy.every(Number.isFinite)&&Math.abs(xy[0])<=180&&Math.abs(xy[1])<=90)return [xy[1],xy[0]];
}

// A shared link is a warning, not proof of an incorrect facility or pin.
export function flyerLinkConflicts(row,rows){
 const canonical=value=>{
  try{const url=new URL(value);url.searchParams.delete('g_st');url.searchParams.sort();return url.href}catch{return ''}
 };
 const link=canonical(flyerLocationInfo(row)?.mapUrl);
 if(!link)return [];
 return [...new Set(rows.filter(other=>(other.name!==row.name||other.region!==row.region)&&canonical(flyerLocationInfo(other)?.mapUrl)===link).map(other=>other.name))];
}
