"""Five demo receipts with ground truth. Every item is either in the price book
(by name or alias) or deliberately not, so the comparison can score matches."""
import json, random, sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter

OUT = sys.argv[1]
F = "/usr/share/fonts/truetype/dejavu/"
FONTS = {
    "mono_b": F + "DejaVuSansMono-Bold.ttf",
    "mono": F + "DejaVuSansMono.ttf",
    "sans": F + "DejaVuSans.ttf",
    "sans_b": F + "DejaVuSans-Bold.ttf",
}

RECEIPTS = [
    dict(file="receipt-01-alfatah.png", store="AL-FATAH SUPERSTORE", sub=["Gulberg III, Lahore", "Date: 25-10-2026   Time: 18:42"],
         font="mono_b", size=34, width=900, style="clean",
         items=[(1, "Cooking Oil 3 Ltr", 1890), (1, "Basmati Rice 5 kg", 2250), (1, "Sugar 1 kg", 190), (2, "Milk 1 Ltr", 460),
                (1, "Tea 500 g", 1250), (1, "Eggs Dozen", 360), (1, "Detergent 1 kg", 750), (1, "Bread Large", 170)],
         extras=[], paid=8000),
    dict(file="receipt-02-imtiaz.png", store="IMTIAZ SUPER MARKET", sub=["Gulshan-e-Iqbal, Karachi", "Invoice: 88213   Date: 26/10/2026"],
         font="sans", size=28, width=640, style="clean",
         items=[(3, "Olpers Milk 1 Ltr", 690), (1, "Tapal Danedar 500 g", 1230), (1, "Anday 12 Pcs", 370), (1, "Sunflower Oil 3 Ltr", 1850),
                (1, "Surf Excel 1 kg", 760), (1, "Colgate 150 g", 340), (1, "Lifebuoy Soap 3 Pack", 450)],
         extras=[("Discount", -100)], paid=6000),
    dict(file="receipt-03-carrefour.png", store="CARREFOUR", sub=["Packages Mall, Lahore", "Till: 07   Date: 24-10-2026 20:15"],
         font="mono", size=30, width=760, style="commas",
         items=[(1, "Basmati Rice 5 kg", 2150), (1, "Atta 10 kg", 1390), (1, "Sugar 5 kg", 850), (1, "Nido 900 g", 1750),
                (1, "Ketchup 800 g", 540), (1, "Dishwash 500 ml", 350), (1, "Tissue Box", 199), (1, "Bread Large", 150)],
         extras=[], paid=7500),
    dict(file="receipt-04-metro.png", store="METRO CASH & CARRY", sub=["Blue Area, Islamabad", "Customer: 10442   Date: 23-10-2026"],
         font="mono_b", size=26, width=860, style="columns",
         items=[(2, "Chicken 1 kg", 1420), (1, "Potatoes 5 kg", 590), (1, "Onions 5 kg", 670), (2, "Tomato Paste 400 g", 620),
                (3, "Lays Chips 70 g", 180), (2, "Pepsi 1.5 Ltr", 340), (1, "Coffee 100 g", 1150)],
         extras=[("GST 17% (included)", None)], paid=5000),
    dict(file="receipt-05-naheed.png", store="NAHEED SUPERMARKET", sub=["Bahadurabad, Karachi", "Date: 26-10-2026   Cashier: Asma"],
         font="sans_b", size=30, width=820, style="photo",
         items=[(1, "Dalda Cooking Oil 3 Ltr", 1900), (1, "Super Basmati 5 kg", 2300), (1, "Dahi 1 kg", 300), (1, "Blue Band 200 g", 600),
                (1, "Shan Biryani Masala", 150), (1, "Nestle Water 6 Pack", 500), (1, "Panadol 20 Tablets", 110), (2, "Nescafe 100 g", 2300)],
         extras=[], paid=9000),
]

def money(n, commas):
    return f"{n:,}" if commas else str(n)

def render(spec):
    big = ImageFont.truetype(FONTS[spec["font"]], spec["size"] + 10)
    f = ImageFont.truetype(FONTS[spec["font"]], spec["size"])
    W = spec["width"]
    commas = spec["style"] == "commas"
    items_sum = sum(p for _, _, p in spec["items"])
    adjust = sum(v for _, v in spec["extras"] if v)
    total = items_sum + adjust

    rows = [("c", spec["store"], big)] + [("c", s, f) for s in spec["sub"]] + [("c", "-" * 32, f)]
    if spec["style"] == "columns":
        rows.append(("cols", ("ITEM", "QTY", "RATE", "AMOUNT"), f))
    for qty, name, price in spec["items"]:
        if spec["style"] == "columns":
            rows.append(("cols", (name, str(qty), money(price // qty, False), money(price, False)), f))
        else:
            label = f"{qty} x {name}" if qty > 1 else name
            rows.append(("lr", (label, money(price, commas)), f))
    rows.append(("c", "-" * 32, f))
    rows.append(("lr", ("Sub Total", money(items_sum, commas)), f))
    for label, value in spec["extras"]:
        rows.append(("lr", (label, money(abs(value), commas) if value else money(round(items_sum * 0.17 / 1.17), commas)), f))
    rows.append(("lr", ("TOTAL", money(total, commas)), big))
    rows.append(("lr", ("Cash", money(spec["paid"], commas)), f))
    rows.append(("lr", ("Change", money(spec["paid"] - total, commas)), f))
    rows.append(("c", "-" * 32, f))
    rows.append(("c", "Thank you for shopping", f))

    lh = spec["size"] + 22
    H = 110 + lh * len(rows) + 60
    img = Image.new("RGB", (W, H), "white")
    d = ImageDraw.Draw(img)
    y = 50
    m = 60
    for kind, content, font in rows:
        if kind == "c":
            w = d.textlength(content, font=font)
            d.text(((W - w) / 2, y), content, font=font, fill="black")
        elif kind == "lr":
            label, value = content
            d.text((m, y), label, font=font, fill="black")
            d.text((W - m - d.textlength(value, font=font), y), value, font=font, fill="black")
        else:
            name, qty, rate, amount = content
            d.text((m, y), name, font=font, fill="black")
            for text, right in ((qty, W - 300), (rate, W - 170), (amount, W - m)):
                d.text((right - d.textlength(text, font=font), y), text, font=font, fill="black")
        y += lh + (12 if font is big else 0)

    if spec["style"] == "photo":
        # Phone-photo feel: off-white, slight tilt, soft blur, grain.
        bg = Image.new("RGB", (W + 80, H + 80), (236, 232, 224))
        img = img.rotate(1.6, resample=Image.BICUBIC, expand=True, fillcolor=(236, 232, 224))
        bg.paste(img, (40, 40))
        img = bg.filter(ImageFilter.GaussianBlur(0.7))
        px = img.load()
        rnd = random.Random(7)
        for _ in range(img.width * img.height // 12):
            x, yy = rnd.randrange(img.width), rnd.randrange(img.height)
            r, g, b = px[x, yy]
            k = rnd.randint(-18, 18)
            px[x, yy] = (max(0, min(255, r + k)), max(0, min(255, g + k)), max(0, min(255, b + k)))

    img.save(f"{OUT}/{spec['file']}")
    return {"file": spec["file"], "store": spec["store"], "total": total,
            "items": [{"name": n, "qty": q, "price": p} for q, n, p in spec["items"]]}

truth = [render(s) for s in RECEIPTS]
json.dump(truth, open(f"{OUT}/expected.json", "w"), indent=2)
for t in truth:
    print(t["file"], len(t["items"]), "items, total", t["total"])
