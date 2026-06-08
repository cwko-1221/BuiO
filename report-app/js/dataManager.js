/* ========================================
   dataManager.js — XLS 解析 & 數據管理
   ======================================== */

const DataManager = {
    // All parsed records
    records: [],
    // Unique student names across all data
    _studentCache: null,

    /* ---------- PUBLIC API ---------- */

    /** Parse an XLS/XLSX file and add to records */
    async parseFile(file) {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { type: 'array' });
        const results = [];

        for (const sheetName of workbook.SheetNames) {
            const sheet = workbook.Sheets[sheetName];
            const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
            if (rows.length < 10) continue;

            const parsed = this._parseSheet(rows, file.name, sheetName);
            if (parsed && parsed.students.length > 0) {
                results.push(parsed);
            }
        }

        if (results.length > 0) {
            // Remove duplicates (same file+sheet)
            for (const r of results) {
                const idx = this.records.findIndex(
                    x => x.filename === r.filename && x.termCode === r.termCode && x.grade === r.grade && x.schoolYear === r.schoolYear
                );
                if (idx >= 0) this.records.splice(idx, 1);
                this.records.push(r);
            }
            this._studentCache = null;
            this.saveToStorage();
        }
        return results;
    },

    /** Get all unique student names */
    getAllStudents() {
        if (this._studentCache) return this._studentCache;
        const nameSet = new Set();
        for (const rec of this.records) {
            for (const s of rec.students) {
                nameSet.add(s.name);
            }
        }
        this._studentCache = [...nameSet].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
        return this._studentCache;
    },

    /** Get all records for a specific student */
    getStudentRecords(studentName) {
        const results = [];
        for (const rec of this.records) {
            const student = rec.students.find(s => s.name === studentName);
            if (student) {
                results.push({
                    filename: rec.filename,
                    grade: rec.grade,
                    gradeNum: rec.gradeNum,
                    schoolYear: rec.schoolYear,
                    termCode: rec.termCode,
                    termLabel: rec.termLabel,
                    className: rec.className,
                    subjects: rec.subjects,
                    student: student,
                    classAverage: rec.classAverage,
                    classMax: rec.classMax,
                    classMin: rec.classMin,
                    totalStudents: rec.students.length
                });
            }
        }
        // Sort by grade then term
        results.sort((a, b) => {
            if (a.gradeNum !== b.gradeNum) return a.gradeNum - b.gradeNum;
            return a.termCode.localeCompare(b.termCode);
        });
        return results;
    },

    /** Get all unique grades in data */
    getGrades() {
        const s = new Set(this.records.map(r => r.grade));
        return [...s].sort((a, b) => {
            const na = parseInt(a.replace(/\D/g, ''));
            const nb = parseInt(b.replace(/\D/g, ''));
            return na - nb;
        });
    },

    /** Get school years for a given grade */
    getSchoolYears(grade) {
        const s = new Set(this.records.filter(r => !grade || r.grade === grade).map(r => r.schoolYear));
        return [...s].sort();
    },

    /** Get terms for a given grade & school year */
    getTerms(grade, schoolYear) {
        const s = new Set(
            this.records
                .filter(r => (!grade || r.grade === grade) && (!schoolYear || r.schoolYear === schoolYear))
                .map(r => r.termLabel)
        );
        return [...s].sort();
    },

    /** Get a specific record */
    getRecord(grade, schoolYear, termLabel) {
        return this.records.find(
            r => r.grade === grade && r.schoolYear === schoolYear && r.termLabel === termLabel
        );
    },

    /** Get records matching filters */
    getRecords(filters = {}) {
        return this.records.filter(r => {
            if (filters.grade && r.grade !== filters.grade) return false;
            if (filters.schoolYear && r.schoolYear !== filters.schoolYear) return false;
            if (filters.termLabel && r.termLabel !== filters.termLabel) return false;
            return true;
        });
    },

    /** Get all unique main subject names */
    getAllSubjects() {
        const s = new Set();
        for (const rec of this.records) {
            for (const subj of rec.subjects) {
                s.add(subj.name);
            }
        }
        return [...s];
    },

    /** Get summary stats for data overview */
    getOverviewStats() {
        const files = new Set(this.records.map(r => r.filename));
        const students = this.getAllStudents();
        const grades = this.getGrades();
        const years = new Set(this.records.map(r => r.schoolYear));
        return {
            fileCount: files.size,
            studentCount: students.length,
            gradeCount: grades.length,
            yearCount: years.size,
        };
    },

    /** Get standard subject weight for overall calculations */
    getSubjectWeight(subjName) {
        if (['中文', '英文', '數學'].includes(subjName)) return 3;
        if (subjName === '常識') return 2;
        if (['小學人文', '小學科學'].includes(subjName)) return 1;
        // Default minor subjects have no weight in overall academic performance unless explicitly stated
        return 0;
    },

    /** Get file list for data table */
    getFileList() {
        return this.records.map(r => ({
            filename: r.filename,
            schoolYear: r.schoolYear,
            grade: r.grade,
            className: r.className,
            termLabel: r.termLabel,
            studentCount: r.students.length,
            subjectCount: r.subjects.length,
        }));
    },

    /** Clear all data */
    clearAll() {
        this.records = [];
        this._studentCache = null;
        localStorage.removeItem('assessmentData');
    },

    /** Save to localStorage */
    saveToStorage() {
        try {
            localStorage.setItem('assessmentData', JSON.stringify(this.records));
        } catch (e) {
            console.warn('LocalStorage save failed:', e);
        }
    },

    /** Load from localStorage */
    loadFromStorage() {
        try {
            const data = localStorage.getItem('assessmentData');
            if (data) {
                this.records = JSON.parse(data);
                this._studentCache = null;
                return true;
            }
        } catch (e) {
            console.warn('LocalStorage load failed:', e);
        }
        return false;
    },

    /* ---------- PRIVATE PARSING ---------- */

    _parseSheet(rows, filename, sheetName) {
        try {
            // Find metadata rows
            let schoolYear = '';
            let termCode = '';
            let grade = '';
            let className = '';
            let headerRowIdx = -1;

            for (let i = 0; i < Math.min(rows.length, 12); i++) {
                const row = rows[i];
                const joined = row.join(' ');

                // School year: look for "學年:"
                if (joined.includes('學年')) {
                    for (const cell of row) {
                        const s = String(cell);
                        const m = s.match(/(\d{4}\/\d{4})/);
                        if (m) { schoolYear = m[1]; break; }
                    }
                }

                // Term & class: look for "T1A1" etc and "P6(6A)" etc
                if (joined.includes('級別')) {
                    for (const cell of row) {
                        const s = String(cell);
                        // Term code
                        const tm = s.match(/T\d+A\d+/);
                        if (tm) termCode = tm[0];
                        // Grade & class
                        const gm = s.match(/P(\d)\((\d[A-Z])\)/i);
                        if (gm) {
                            grade = 'P' + gm[1];
                            className = gm[2];
                        }
                    }
                }

                // Header row: contains "班號"
                if (row.some(c => String(c).includes('班號'))) {
                    headerRowIdx = i;
                }
            }

            if (!schoolYear || !grade || headerRowIdx < 0) {
                console.warn(`Skipping sheet ${sheetName}: missing metadata`);
                return null;
            }

            // Parse term label
            const termLabel = this._termCodeToLabel(termCode);

            // Parse column headers
            const headerRow = rows[headerRowIdx];
            const subjects = this._parseHeaders(headerRow);

            // Parse student rows
            const students = [];
            for (let i = headerRowIdx + 1; i < rows.length; i++) {
                const row = rows[i];
                if (!row || row.length < 3) continue;

                // Check if this is a student row (first cell is a number)
                const classNo = parseInt(row[0]);
                if (isNaN(classNo) || classNo <= 0) {
                    // Check for summary rows
                    const firstCell = String(row[0] || '') + String(row[1] || '');
                    if (firstCell.includes('學生總數') || firstCell.includes('退修') ||
                        firstCell.includes('及格') || firstCell.includes('班別平均') ||
                        firstCell.includes('最高') || firstCell.includes('最低') ||
                        firstCell.includes('標準差') || firstCell.includes('備註')) {
                        continue;
                    }
                    continue;
                }

                const name = String(row[1] || '').trim();
                if (!name) continue;

                const scores = this._parseStudentScores(row, subjects);

                // Check if student has any valid scores
                const hasScores = Object.values(scores).some(s =>
                    s.total !== null && s.total !== undefined
                );

                students.push({ classNo, name, scores, hasScores });
            }

            // Parse class summary stats
            const classAverage = {};
            const classMax = {};
            const classMin = {};

            for (let i = headerRowIdx + 1; i < rows.length; i++) {
                const row = rows[i];
                const firstCells = String(row[0] || '') + String(row[1] || '');

                if (firstCells.includes('班別平均')) {
                    this._parseSummaryRow(row, subjects, classAverage);
                } else if (firstCells.includes('最高')) {
                    this._parseSummaryRow(row, subjects, classMax);
                } else if (firstCells.includes('最低')) {
                    this._parseSummaryRow(row, subjects, classMin);
                }
            }

            // Fallback: Calculate dynamically if summary rows are missing from the file
            for (const subj of subjects) {
                if (classAverage[subj.name] === undefined && !subj.isGrade) {
                    let sum = 0, count = 0;
                    let max = -1, min = 99999;
                    for (const st of students) {
                        if (!st.hasScores) continue;
                        const num = this.getNumericScore(st.scores[subj.name]?.total);
                        if (num !== null) {
                            sum += num;
                            count++;
                            if (num > max) max = num;
                            if (num < min) min = num;
                        }
                    }
                    if (count > 0) {
                        classAverage[subj.name] = sum / count;
                        if (classMax[subj.name] === undefined) classMax[subj.name] = max;
                        if (classMin[subj.name] === undefined) classMin[subj.name] = min;
                    }
                }
            }

            return {
                filename,
                sheetName,
                schoolYear,
                termCode,
                termLabel,
                grade,
                gradeNum: parseInt(grade.replace(/\D/g, '')),
                className,
                subjects,
                students,
                classAverage,
                classMax,
                classMin
            };
        } catch (e) {
            console.error(`Error parsing sheet ${sheetName} in ${filename}:`, e);
            return null;
        }
    },

    _termCodeToLabel(code) {
        const map = {
            'T1A1': 'Term 1',
            'T1A2': 'Term 2',
            'T1A3': 'Term 3',
            'T2A1': 'Term 4',
            'T2A2': 'Term 5',
            'T2A3': 'Term 6',
        };
        return map[code] || code || 'Unknown';
    },

    _parseHeaders(headerRow) {
        const subjects = [];
        let colIdx = 2; // Skip 班號 and 姓名
        let currentSubject = null;

        while (colIdx < headerRow.length) {
            const cell = String(headerRow[colIdx] || '').trim();
            if (!cell) { colIdx++; continue; }

            // Clean up the cell text (remove newlines, extra spaces)
            const lines = cell.split(/\r?\n/).map(l => l.trim()).filter(l => l);
            const firstLine = lines[0] || '';

            // Check if this is a main subject total column (contains "總分" or "總括")
            const isTotal = lines.some(l => l.includes('總分') || l.includes('總括'));
            // Extract max score from patterns like (P)300, (E)300, (C)300, (C)100
            const maxMatch = cell.match(/\((?:P|E|C)\)(\d+)/);
            const maxScore = maxMatch ? parseInt(maxMatch[1]) : null;
            // Check if it's a grade-based subject (contains grade indicators like A+)
            const isGrade = cell.includes('A+') && (lines.some(l => l.includes('總括')));

            // Detect subject name from first line
            let subjectName = firstLine
                .replace(/[\r\n]/g, '')
                .replace(/\((?:P|E|C)\)\d+/g, '')
                .replace(/\((?:P|E|C)\)/g, '')
                .replace(/[A-Z][+-]?\s*$/g, '')
                .trim();

            // Known subject totals
            const mainSubjects = ['中文', '英文', '數學', '常識', '視藝', '音樂', '體育', 'ＩＣＴ小', '小學人文', '小學科學'];

            // A column is a new main subject ONLY if it has 總分/總括 in it,
            // OR it's a standalone subject (like 小學人文, 小學科學) that has no sub-items.
            // Sub-columns like "中文(P)100" should NOT start a new subject.
            const isNewMainSubject = isTotal || 
                mainSubjects.some(ms => {
                    const matchesName = subjectName.includes(ms) || firstLine.includes(ms);
                    if (!matchesName) return false;
                    // If already tracking this same subject, this is a sub-item, not a new subject
                    if (currentSubject && currentSubject.name === ms) return false;
                    // Standalone subjects without 總分 (like 小學人文, 小學科學)
                    if (['小學人文', '小學科學', '視藝', '音樂', '體育', 'ＩＣＴ小'].some(s => ms.includes(s) || s.includes(ms))) return true;
                    // For core subjects (中英數常), require 總分/總括 to be a main subject
                    return isTotal;
                });

            if (isNewMainSubject) {
                // This is a new main subject
                const name = this._extractMainSubjectName(lines, mainSubjects);

                if (name) {
                    if (currentSubject) {
                        subjects.push(currentSubject);
                    }
                    currentSubject = {
                        name: name,
                        startCol: colIdx,
                        maxScore: maxScore,
                        isGrade: isGrade || ['體育', 'ＩＣＴ小'].includes(name),
                        subItems: [],
                        colCount: 1
                    };
                    colIdx++;
                    // Now read sub-items until next main subject
                    continue;
                }
            }

            // This is a sub-item of the current subject
            if (currentSubject) {
                const itemName = this._extractSubItemName(lines);
                const itemMax = maxMatch ? parseInt(maxMatch[1]) : null;
                currentSubject.subItems.push({
                    name: itemName,
                    col: colIdx,
                    maxScore: itemMax
                });
                currentSubject.colCount++;
            }

            colIdx++;
        }

        if (currentSubject) {
            subjects.push(currentSubject);
        }

        return subjects;
    },

    _extractMainSubjectName(lines, knownSubjects) {
        const fullText = lines.join('');
        for (const ms of knownSubjects) {
            if (fullText.includes(ms)) {
                if (ms === 'ＩＣＴ小') return 'ICT';
                return ms;
            }
        }
        // Fallback: use first meaningful word
        const clean = lines[0]
            .replace(/總分|總括|\(.*?\)|\d+|[A-Z][+-]?/g, '')
            .trim();
        return clean || null;
    },

    _extractSubItemName(lines) {
        if (!lines.length) return '未知';
        return lines[0]
            .replace(/\((?:P|E|C)\)\d+/g, '')
            .replace(/\((?:P|E|C)\)/g, '')
            .replace(/[A-Z][+-]?\s*$/g, '')
            .trim() || '未知';
    },

    _parseStudentScores(row, subjects) {
        const scores = {};
        for (const subj of subjects) {
            const totalVal = this._parseScore(row[subj.startCol]);

            const items = {};
            for (const item of subj.subItems) {
                items[item.name] = this._parseScore(row[item.col]);
            }

            scores[subj.name] = {
                total: totalVal,
                items: items,
                isGrade: subj.isGrade
            };
        }
        return scores;
    },

    _parseScore(val) {
        if (val === undefined || val === null || val === '' || val === '---') return null;
        const s = String(val).trim();
        if (s === '---' || s === 'N.A.' || s === 'N.A') return null;
        // Handle "+" (absent, zero score) or "-" (absent, not counted)
        if (s === '+' || s === '-') return null;
        // Grade values (A+, B-, etc.)
        const gradeMap = { 'A+': 97, 'A': 93, 'A-': 90, 'B+': 85, 'B': 80, 'B-': 75, 'C+': 70, 'C': 65, 'C-': 60, 'D': 50 };
        const trimmed = s.replace(/\s/g, '');
        if (gradeMap[trimmed] !== undefined) return { grade: trimmed, numeric: gradeMap[trimmed] };
        const num = parseFloat(s);
        return isNaN(num) ? null : num;
    },

    _parseSummaryRow(row, subjects, target) {
        for (const subj of subjects) {
            const val = this._parseScore(row[subj.startCol]);
            if (val !== null) {
                target[subj.name] = typeof val === 'object' ? val : val;
            }
        }
    },

    /** Helper: get numeric score value (handles both number and grade objects) */
    getNumericScore(score) {
        if (score === null || score === undefined) return null;
        if (typeof score === 'number') return score;
        if (typeof score === 'object' && score.numeric !== undefined) return score.numeric;
        return null;
    },

    /** Helper: format score for display */
    formatScore(score) {
        if (score === null || score === undefined) return '---';
        if (typeof score === 'number') return score % 1 === 0 ? score.toString() : score.toFixed(1);
        if (typeof score === 'object' && score.grade) return score.grade;
        return String(score);
    },

    /** Get the percentage score for cross-subject comparison */
    getPercentage(score, maxScore) {
        const num = this.getNumericScore(score);
        if (num === null || !maxScore) return null;
        return (num / maxScore) * 100;
    },

    /** Parse pre-loaded data from PRELOAD_DATA constant (generated by build_data.ps1) */
    parsePreloadData(preloadData) {
        if (!preloadData || !Array.isArray(preloadData)) return 0;
        let count = 0;
        for (const fileData of preloadData) {
            const filename = fileData.filename;
            for (const sheetData of fileData.sheets) {
                const rows = sheetData.rows;
                if (!rows || rows.length < 10) continue;
                const parsed = this._parseSheet(rows, filename, sheetData.name);
                if (parsed && parsed.students.length > 0) {
                    // Remove duplicates
                    const idx = this.records.findIndex(
                        x => x.filename === parsed.filename && x.termCode === parsed.termCode &&
                             x.grade === parsed.grade && x.schoolYear === parsed.schoolYear
                    );
                    if (idx >= 0) this.records.splice(idx, 1);
                    this.records.push(parsed);
                    count++;
                }
            }
        }
        this._studentCache = null;
        return count;
    }
};
