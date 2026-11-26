# .fabsteel format v1 (JSON, usually gzip; units mm)
{ "fmt":"fabsteel","ver":1,
  "prj":{"name","no","by","date","tekla","unit"},
  "grid":{"x":[{"n":"A","v":0}],"y":[{"n":"1","v":0}],"z":[{"n":"+0.000","v":0}]},
  "parts":[{"id":int,"m":"C101","a":"asm mark","mp":1(main part of its assembly),"n":"name","p":"profile","mt":"material","w":kg,"l":mm,"c":"class",
            "bb":[minX,minY,minZ,maxX,maxY,maxZ],"ln":[x1,y1,z1,x2,y2,z2],"sec":[width,height]}],
  "bolts":[{"id":int,"d":diameter,"l":length,"s":"8.8","std":"standard","n":count,"nu":nuts/bolt,"wa":washers/bolt,"ps":[partIds],"at":[x,y,z]}] }
