"""Generates fake ACORD 125-style sample submissions for the demo.
All businesses, people, and numbers are fictional."""
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor, black
import subprocess, random, os
from PIL import Image, ImageFilter, ImageEnhance, ImageOps

W, H = letter
M = 36  # margin
GRAY = HexColor("#D9D9D9")

def section(c, y, title):
    c.setFillColor(GRAY); c.rect(M, y - 14, W - 2*M, 14, fill=1, stroke=1)
    c.setFillColor(black); c.setFont("Helvetica-Bold", 8.5)
    c.drawString(M + 4, y - 10.5, title)
    return y - 14

def row(c, y, cells, h=24):
    """cells: list of (label, value, width_fraction)"""
    x = M; total = W - 2*M
    for label, value, frac in cells:
        w = total * frac
        c.rect(x, y - h, w, h, stroke=1, fill=0)
        c.setFont("Helvetica", 7.5); c.drawString(x + 3, y - 9, label)
        c.setFont("Courier-Bold", 10.5)
        if value: c.drawString(x + 3, y - h + 5, value)
        x += w
    return y - h

def checks(c, y, label, options, h=24):
    c.rect(M, y - h, W - 2*M, h, stroke=1, fill=0)
    c.setFont("Helvetica", 7.5); c.drawString(M + 3, y - 9, label)
    x = M + 6
    for name, on in options:
        c.rect(x, y - h + 4, 9, 9, stroke=1, fill=0)
        if on:
            c.setFont("Helvetica-Bold", 10); c.drawString(x + 1.2, y - h + 5.2, "X")
        c.setFont("Helvetica", 8.5); c.drawString(x + 13, y - h + 5.5, name)
        x += 13 + c.stringWidth(name, "Helvetica", 8.5) + 18
    return y - h

def form(path, d):
    c = canvas.Canvas(path, pagesize=letter)
    c.setLineWidth(0.7)
    y = H - M
    c.setFont("Helvetica-Bold", 15); c.drawString(M, y - 14, "COMMERCIAL INSURANCE APPLICATION")
    c.setFont("Helvetica", 9); c.drawString(M, y - 27, "APPLICANT INFORMATION SECTION")
    c.rect(W - M - 150, y - 30, 150, 30)
    c.setFont("Helvetica", 7.5); c.drawString(W - M - 147, y - 9, "DATE (MM/DD/YYYY)")
    c.setFont("Courier-Bold", 10.5); c.drawString(W - M - 147, y - 25, d["date"])
    y -= 40
    y = section(c, y, "AGENCY")
    y = row(c, y, [("AGENCY NAME", d["agency"], .5), ("PRODUCER", d["producer"], .5)])
    y = row(c, y, [("AGENCY PHONE", d["agency_phone"], .35), ("AGENCY EMAIL", d["agency_email"], .65)])
    y -= 6
    y = section(c, y, "POLICY INFORMATION")
    y = row(c, y, [("PROPOSED EFF DATE", d["eff"], .5), ("PROPOSED EXP DATE", d["exp"], .5)])
    y = checks(c, y, "LINES OF BUSINESS", d["lines"])
    y -= 6
    y = section(c, y, "APPLICANT INFORMATION")
    y = row(c, y, [("NAME (FIRST NAMED INSURED)", d["name"], .6), ("DBA", d["dba"], .4)])
    y = row(c, y, [("MAILING ADDRESS", d["street"], .45), ("CITY", d["city"], .27), ("STATE", d["state"], .12), ("ZIP", d["zip"], .16)])
    y = row(c, y, [("FEIN", d["fein"], .3), ("BUSINESS PHONE", d["phone"], .3), ("WEBSITE", d["web"], .4)])
    y = checks(c, y, "LEGAL ENTITY", d["entity"])
    y -= 6
    y = section(c, y, "NATURE OF BUSINESS")
    y = row(c, y, [("YEARS IN BUSINESS", d["years"], .3), ("NAICS CODE", d["naics"], .3), ("ANNUAL REVENUES", d["revenue"], .4)])
    y = row(c, y, [("DESCRIPTION OF OPERATIONS", d["ops"], 1.0)])
    y = row(c, y, [("FULL-TIME EMPLOYEES", d["ft"], .5), ("PART-TIME EMPLOYEES", d["pt"], .5)])
    y -= 6
    y = section(c, y, "CONTACT INFORMATION")
    y = row(c, y, [("CONTACT NAME", d["contact"], .3), ("CONTACT PHONE", d["contact_phone"], .22), ("CONTACT EMAIL", d["contact_email"], .48)])
    y -= 6
    y = section(c, y, "PRIOR CARRIER AND LOSS HISTORY")
    y = row(c, y, [("PRIOR CARRIER", d["prior"], .6), ("EXPIRING PREMIUM", d["premium"], .4)])
    y = checks(c, y, "ANY LOSSES IN THE LAST 5 YEARS", d["losses"])
    y = row(c, y, [("LOSS SUMMARY", d["loss_summary"], 1.0)])
    y -= 30
    c.line(M, y, M + 300, y); c.line(M + 340, y, W - M, y)
    c.setFont("Helvetica", 7.5)
    c.drawString(M, y - 10, "APPLICANT'S SIGNATURE"); c.drawString(M + 340, y - 10, "DATE")
    c.setFont("Courier-Bold", 10.5); c.drawString(M + 345, y + 4, d["date"])
    c.setFont("Helvetica-Oblique", 7)
    c.drawString(M, 30, "Sample form modeled on ACORD 125 fields, created for demo use only. Not an official ACORD form. All data is fictional.")
    c.save()

LINES = ["GENERAL LIABILITY", "PROPERTY", "BUSINESS AUTO", "WORKERS COMP", "UMBRELLA"]
ENT = ["CORPORATION", "LLC", "PARTNERSHIP", "INDIVIDUAL"]
opt = lambda names, on: [(n, n in on) for n in names]

harborview = dict(
    date="09/21/2026", agency="Cascade Risk Partners", producer="Dana Ortiz",
    agency_phone="(503) 555-0142", agency_email="dana.ortiz@cascaderisk.example",
    eff="11/15/2026", exp="11/15/2027",
    lines=opt(LINES, ["GENERAL LIABILITY", "PROPERTY"]),
    name="Harborview Bakery Co.", dba="Harborview Bread and Coffee",
    street="1820 NW Marshall St", city="Portland", state="OR", zip="97209",
    fein="", phone="(503) 555-0187", web="harborviewbakery.example",
    entity=opt(ENT, ["LLC"]), years="7", naics="311811", revenue="$1,450,000",
    ops="Retail bakery and cafe; on-site baking, counter service, small event catering.",
    ft="14", pt="6", contact="Marisol Vega, Owner", contact_phone="(503) 555-0188",
    contact_email="marisol@harborviewbakery.example",
    prior="Columbia Shore Insurance Co.", premium="$6,200",
    losses=opt(["YES", "NO"], ["YES"]), loss_summary="2024 slip and fall at counter, $8,400 paid, claim closed.",
)
pinecrest = dict(
    date="09/18/2026", agency="Inland Northwest Insurance Group", producer="Sam Whitaker",
    agency_phone="(509) 555-0110", agency_email="sam@inwinsurance.example",
    eff="11/01/2026", exp="11/01/2027",
    lines=opt(LINES, ["GENERAL LIABILITY", "PROPERTY"]),
    name="Pinecrest Auto Repair Inc.", dba="",
    street="4410 E Sprague Ave", city="Spokane", state="WA", zip="99202",
    fein="91-4827365", phone="(509) 555-0133", web="pinecrestauto.example",
    entity=opt(ENT, ["CORPORATION"]), years="12", naics="811111", revenue="$2,100,000",
    ops="General automotive repair and maintenance. No towing, no body or paint work.",
    ft="9", pt="2", contact="Rob Kessler, Owner", contact_phone="(509) 555-0134",
    contact_email="rob@pinecrestauto.example",
    prior="Granite Peak Insurance", premium="$9,850",
    losses=opt(["YES", "NO"], ["NO"]), loss_summary="None reported.",
)

summit = dict(
    date="09/22/2026", agency="Lone Star Commercial Brokers", producer="Alicia Ramos",
    agency_phone="(512) 555-0160", agency_email="alicia@lonestarcb.example",
    eff="10/15/2026", exp="10/15/2027",
    lines=opt(LINES, ["GENERAL LIABILITY"]),
    name="Summit Ridge Roofing LLC", dba="",
    street="7702 Research Blvd", city="Austin", state="TX", zip="78758",
    fein="74-3918205", phone="(512) 555-0171", web="summitridgeroofing.example",
    entity=opt(ENT, ["LLC"]), years="5", naics="238160", revenue="$3,800,000",
    ops="Residential and light commercial roofing installation and repair.",
    ft="22", pt="0", contact="Jake Holloway, Operations", contact_phone="(512) 555-0172",
    contact_email="jake@summitridgeroofing.example",
    prior="Bluebonnet Casualty Co.", premium="$18,400",
    losses=opt(["YES", "NO"], ["NO"]), loss_summary="None reported.",
)

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "samples")
form(f"{out}/pinecrest_acord125.pdf", pinecrest)
form(f"{out}/summit_ridge_acord125.pdf", summit)
form("/tmp/harborview_clean.pdf", harborview)

# Simulate a scan: rasterize, tilt, add noise, soften, JPEG
subprocess.run(["pdftoppm", "-r", "200", "-gray", "-png", "-singlefile", "/tmp/harborview_clean.pdf", "/tmp/hv"], check=True)
img = Image.open("/tmp/hv.png").convert("L")
img = img.rotate(-0.9, resample=Image.BICUBIC, expand=False, fillcolor=255)
random.seed(7)
px = img.load(); w, h = img.size
for _ in range(int(w*h*0.004)):
    x, y = random.randrange(w), random.randrange(h); px[x, y] = random.randint(90, 190)
img = img.filter(ImageFilter.GaussianBlur(0.6))
img = ImageEnhance.Contrast(img).enhance(0.85)
shade = Image.new("L", (40, h), 205); img.paste(shade, (0, 0))  # scanner edge shadow
img = ImageOps.autocontrast(img, cutoff=0) if False else img
img.save(f"{out}/harborview_acord125_scan.jpg", quality=80)

# Sample email from the agent, with the scan attached
from email.message import EmailMessage
msg = EmailMessage()
msg["From"] = "Dana Ortiz <dana.ortiz@cascaderisk.example>"
msg["To"] = "submissions@carrier.example"
msg["Subject"] = "New submission: Harborview Bakery Co. (GL + Property), eff 11/15"
msg["Date"] = "Mon, 21 Sep 2026 10:14:00 -0700"
msg.set_content("""Hi team,

Attached is the signed application for Harborview Bakery Co., a retail bakery and cafe in Portland, OR. We're looking for general liability and property effective 11/15/2026.

Quick notes:
- 7 years in business, owner-operated (Marisol Vega)
- Revenue around $1.45M, 14 full-time and 8 part-time staff
- One closed slip-and-fall claim in 2024

Their current carrier is exiting the bakery class, so timing matters. Happy to send anything else you need.

Thanks,
Dana Ortiz
Cascade Risk Partners
(503) 555-0142
""")
with open(f"{out}/harborview_acord125_scan.jpg", "rb") as f:
    msg.add_attachment(f.read(), maintype="image", subtype="jpeg", filename="Harborview_ACORD125_signed.jpg")
with open(f"{out}/harborview_submission.eml", "wb") as f:
    f.write(bytes(msg))
print("done", img.size)
