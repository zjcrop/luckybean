from pathlib import Path

path = Path(__file__).resolve().parents[1] / 'tests/v120-requirements-ui.spec.mjs'
text = path.read_text(encoding='utf-8')

replacements = [
    (
        "  await expect(page.locator('#firstCoolingMode')).toHaveValue('custom');\n  await page.locator('#firstCoolingMode').dispatchEvent('pointerdown');\n  await expect(page.locator('[data-overlay=\"cooling\"]')).toBeVisible();",
        "  await expect(page.locator('#firstCoolingMode')).toContainText('82°C');\n  await page.locator('#firstCoolingMode').click();\n  await expect(page.locator('[data-overlay=\"cooling-mode\"]')).toBeVisible();\n  await page.locator('[data-cooling-choice=\"custom\"]').click();\n  await expect(page.locator('[data-overlay=\"cooling\"]')).toBeVisible();"
    ),
    (
        "  await expect(page.locator('#tailCoolingMode')).toHaveValue('custom');\n  await page.locator('#tailCoolingMode').dispatchEvent('pointerdown');\n  await expect(page.locator('[data-overlay=\"cooling\"]')).toBeVisible();",
        "  await expect(page.locator('#tailCoolingMode')).toContainText('60°C');\n  await page.locator('#tailCoolingMode').click();\n  await expect(page.locator('[data-overlay=\"cooling-mode\"]')).toBeVisible();\n  await page.locator('[data-cooling-choice=\"custom\"]').click();\n  await expect(page.locator('[data-overlay=\"cooling\"]')).toBeVisible();"
    )
]

changed = False
for old, new in replacements:
    if old in text:
        text = text.replace(old, new, 1)
        changed = True

# No old interaction should remain in this spec after the five-row migration.
text = text.replace("await expect(page.locator('#firstCoolingMode')).toHaveValue('custom');", "await expect(page.locator('#firstCoolingMode')).toContainText('82°C');")
text = text.replace("await expect(page.locator('#tailCoolingMode')).toHaveValue('custom');", "await expect(page.locator('#tailCoolingMode')).toContainText('60°C');")
text = text.replace("await page.locator('#firstCoolingMode').dispatchEvent('pointerdown');", "await page.locator('#firstCoolingMode').click();\n  await expect(page.locator('[data-overlay=\"cooling-mode\"]')).toBeVisible();\n  await page.locator('[data-cooling-choice=\"custom\"]').click();")
text = text.replace("await page.locator('#tailCoolingMode').dispatchEvent('pointerdown');", "await page.locator('#tailCoolingMode').click();\n  await expect(page.locator('[data-overlay=\"cooling-mode\"]')).toBeVisible();\n  await page.locator('[data-cooling-choice=\"custom\"]').click();")

path.write_text(text, encoding='utf-8')
print('Remaining cooling E2E interactions migrated to menu flow.')
