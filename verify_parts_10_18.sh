#!/bin/bash
# Verification script for Parts 10-18

echo "=== PART 10: Sketch Clean/Optimised Look ==="
echo "Checking for cleanLook prop and implementation..."
grep -n "cleanLook.*:" src/course/SketchPanel.tsx | head -5
echo ""

echo "=== PART 11: Sketch Social Links Removal ==="
echo "Checking for social link removal..."
grep -n "GitHub\|Discord\|Follow Us" src/course/SketchPanel.tsx | head -5
echo ""
echo "Checking for canvas delete..."
grep -n "onDeleteActive\|deleteCanvas" src/course/SketchPanel.tsx | head -5
echo ""

echo "=== PART 12: Sketch Save/Restore ==="
echo "Checking useCourseSketch persistence..."
grep -n "saveScene\|loadScene\|persistence" src/course/useCourseSketch.ts | head -10
echo ""

echo "=== PART 13: Read Upload Progress ==="
echo "Checking upload stages and progress..."
grep -n "stage.*preparing\|stage.*uploading\|stage.*finalizing" src/course/useReadUploads.ts | head -10
echo ""

echo "=== PART 14: Read URL Import ==="
echo "Checking URL import implementation..."
grep -n "extractUrl\|fetchPdf\|importFromUrl" src/course/readUrlImport.ts | head -10
echo ""

echo "=== PART 15: Multiple URL Import ==="
echo "Checking batch URL handling..."
grep -n "extractUrls\|batch\|multiple.*url" src/course/readUrlImport.ts | head -10
echo ""

echo "=== PART 16: PDF.js Annotation Parity ==="
echo "Checking annotation system..."
grep -n "annotation\|Annotation" src/course/ReadLibraryPanel.tsx | head -10
echo ""

echo "=== PART 17: Course Player Readiness ==="
echo "Checking for readiness gates..."
grep -rn "useEffect.*load\|useState.*loading" src/CoursePlayerApp.tsx | head -10
echo ""

echo "=== PART 18: Split Mode ==="
echo "Checking split deck implementation..."
grep -n "SplitDeck\|split.*ratio" src/course/studyPanels.tsx | head -10
echo ""

echo "=== Verification Complete ==="
