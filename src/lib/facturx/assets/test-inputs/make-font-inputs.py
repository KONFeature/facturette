#!/usr/bin/env python3
"""
Dev-time generator of the non-embedded-font test inputs made with the Python PDF libraries
that French invoicing tools use (not bundled, not run by the tests):

    python src/lib/facturx/assets/test-inputs/make-font-inputs.py

Needs `reportlab` and `fpdf2` (e.g. `python3 -m venv /tmp/venv && /tmp/venv/bin/pip install
reportlab fpdf2`). Produces, next to this file:
  reportlab-invoice.pdf   ReportLab canvas, the 12 standard fonts (never embedded by ReportLab),
                          accented French text, euro sign, typographic quotes, right-aligned
                          amounts in a table
  fpdf2-multipage.pdf     fpdf2 core fonts (Helvetica/Times/Courier, B/I/BI), windows-1252,
                          a long table with right-aligned amounts over several pages
"""

from datetime import datetime, timezone
from pathlib import Path

from fpdf import FPDF
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

HERE = Path(__file__).resolve().parent

LINES = [
    ("Développement d’une application « Facturation »", "3", "500,00 €", "1 500,00 €"),
    ("Hébergement & maintenance — œuvre collective", "12", "45,90 €", "550,80 €"),
    ("Formation à l’outil (journée), déplacement à Besançon", "1", "1 250,00 €", "1 250,00 €"),
    ("Café, thé, crème brûlée… “Noël” ‘ça’ Ÿ ÿ Œ", "7", "3,50 €", "24,50 €"),
]

FONTS = [
    "Helvetica",
    "Helvetica-Bold",
    "Helvetica-Oblique",
    "Helvetica-BoldOblique",
    "Times-Roman",
    "Times-Bold",
    "Times-Italic",
    "Times-BoldItalic",
    "Courier",
    "Courier-Bold",
    "Courier-Oblique",
    "Courier-BoldOblique",
]


def reportlab_invoice() -> None:
    path = HERE / "reportlab-invoice.pdf"
    c = canvas.Canvas(str(path), pagesize=A4, invariant=1, pageCompression=1)
    width, height = A4
    c.setFont("Helvetica-Bold", 18)
    c.drawString(50, height - 60, "FACTURE N° FA-2026-0042")
    c.setFont("Helvetica", 10)
    c.drawString(50, height - 80, "Atelier Dupont SAS — 12 rue de l’Église, 75011 Paris")
    c.setFont("Helvetica-Oblique", 10)
    c.drawString(50, height - 94, "Émise le 15/10/2026 · échéance à 30 jours")

    y = height - 130
    c.setFont("Helvetica-Bold", 10)
    c.drawString(50, y, "Désignation")
    c.drawRightString(390, y, "Qté")
    c.drawRightString(470, y, "PU HT")
    c.drawRightString(545, y, "Total HT")
    c.line(50, y - 4, 545, y - 4)
    c.setFont("Helvetica", 9)
    for label, qty, unit, total in LINES:
        y -= 16
        c.drawString(50, y, label)
        c.drawRightString(390, y, qty)
        c.drawRightString(470, y, unit)
        c.drawRightString(545, y, total)
    y -= 24
    c.setFont("Helvetica-BoldOblique", 11)
    c.drawRightString(470, y, "Total TTC")
    c.drawRightString(545, y, "3 990,36 €")

    y -= 40
    for name in FONTS:
        c.setFont(name, 11)
        c.drawString(50, y, f"{name} : àâäçéèêëîïôöùûüÿœæ ÀÉÈÇŒ € « » “ ” ‘ ’ – — … ‰ ™")
        c.drawRightString(545, y, "1 234,56 €")
        y -= 18
    c.showPage()
    c.save()


def fpdf2_multipage() -> None:
    pdf = FPDF(format="A4")
    pdf.core_fonts_encoding = "windows-1252"
    pdf.set_creation_date(datetime(2026, 10, 15, tzinfo=timezone.utc))
    pdf.set_auto_page_break(True, margin=20)
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 10, "Facture FA-2026-0043 – Société Générique SARL", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Times", "", 11)
    pdf.cell(0, 6, "Conditions : paiement à 30 jours, pénalités au taux légal, indemnité 40 €.",
             new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Times", "I", 11)
    pdf.cell(0, 6, "« Œuvre » réalisée à Besançon, déjà réglée à hauteur de 25 %.",
             new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)
    pdf.set_font("Helvetica", "B", 10)
    for text, w, align in [("Désignation", 100, "L"), ("Qté", 20, "R"), ("PU HT", 30, "R"),
                           ("Total HT", 40, "R")]:
        pdf.cell(w, 7, text, border=1, align=align)
    pdf.ln()
    styles = [("Helvetica", ""), ("Times", "B"), ("Courier", ""), ("Helvetica", "I"),
              ("Times", "BI"), ("Courier", "B"), ("Courier", "I"), ("Courier", "BI"),
              ("Helvetica", "BI"), ("Times", ""), ("Times", "I"), ("Helvetica", "B")]
    for i in range(90):
        family, style = styles[i % len(styles)]
        pdf.set_font(family, style, 9)
        qty = i % 7 + 1
        unit = 37.5 + i * 3.25
        pdf.cell(100, 6, f"Prestation n° {i + 1} – réglage, câblage, contrôle", border=1)
        pdf.cell(20, 6, str(qty), border=1, align="R")
        pdf.cell(30, 6, f"{unit:,.2f} €".replace(",", " ").replace(".", ","), border=1, align="R")
        pdf.cell(40, 6, f"{qty * unit:,.2f} €".replace(",", " ").replace(".", ","), border=1,
                 align="R")
        pdf.ln()
    pdf.set_font("Courier", "B", 11)
    pdf.cell(150, 8, "TOTAL TTC", align="R")
    pdf.cell(40, 8, "12 345,67 €", align="R")
    pdf.output(str(HERE / "fpdf2-multipage.pdf"))


if __name__ == "__main__":
    reportlab_invoice()
    fpdf2_multipage()
