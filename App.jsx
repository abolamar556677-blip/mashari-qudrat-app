import React, { useEffect, useMemo, useState } from 'react';
import {
  ERROR_REASONS,
  normalizeText,
  sampleQuestions,
  typeLabel,
  validateAndNormalizeQuestion
} from './questionTools.js';

const APP_NAME = 'اختبار قدرات محاكي';
const STORAGE_KEY = 'qiyas-simulator-daily-v1';

function emptyProgress() {
  return {
    completedTests: 0,
    lastScore: 0,
    highestScore: 0,
    averageScore: 0,
    totalQuestions: 0,
    correctAnswers: 0,
    wrongAnswers: 0,
    testHistory: [],
    wrongQuestions: [],
    usedQuestionIds: []
  };
}

function initialState() {
  return { appName: APP_NAME, users: [], currentUser: null, questionFiles: [] };
}

function sanitizeQuestionFiles(files = []) {
  return files.map((file) => {
    const questions = (file.questions || [])
      .map((question) => validateAndNormalizeQuestion(question, file.name).question)
      .filter(Boolean);
    return { ...file, count: questions.length, questions };
  }).filter((file) => file.questions.length);
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.appName) return { ...initialState(), ...saved, questionFiles: sanitizeQuestionFiles(saved.questionFiles) };
  } catch {
    return initialState();
  }
  return initialState();
}

function saveState(nextState) {
  const clean = { ...nextState, questionFiles: sanitizeQuestionFiles(nextState.questionFiles) };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
  return clean;
}

function scoreOf(test) {
  const total = test.answers.length || 1;
  const correct = test.answers.filter((answer) => answer.ok).length;
  return Math.round((correct / total) * 100);
}

function recomputeProgress(progress) {
  const testHistory = progress.testHistory || [];
  const answers = testHistory.flatMap((test) => test.answers || []);
  const scores = testHistory.map(scoreOf);
  return {
    ...progress,
    completedTests: testHistory.length,
    lastScore: scores.at(-1) || 0,
    highestScore: Math.max(0, ...scores),
    averageScore: scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : 0,
    totalQuestions: answers.length,
    correctAnswers: answers.filter((answer) => answer.ok).length,
    wrongAnswers: answers.filter((answer) => !answer.ok).length
  };
}

function downloadFile(name, content, type = 'application/json') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function Timer({ onTimeout, questionId }) {
  const [left, setLeft] = useState(90);

  useEffect(() => {
    setLeft(90);
    const id = setInterval(() => {
      setLeft((value) => {
        if (value <= 1) {
          clearInterval(id);
          onTimeout();
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [questionId, onTimeout]);

  return <strong className={left <= 15 ? 'timer danger' : left <= 30 ? 'timer warn' : 'timer'}>{left}</strong>;
}

export default function App() {
  const [state, setState] = useState(() => saveState(loadState()));
  const [view, setView] = useState('home');
  const [auth, setAuth] = useState({ username: '', password: '' });
  const [session, setSession] = useState(null);
  const [report, setReport] = useState(null);
  const [importReport, setImportReport] = useState(null);
  const [analysisDrafts, setAnalysisDrafts] = useState({});

  const user = state.users.find((item) => item.username === state.currentUser) || null;
  const bank = useMemo(() => state.questionFiles.flatMap((file) => file.questions.map((question) => ({
    ...question,
    source: question.source || file.name
  }))), [state.questionFiles]);
  const quantitativeCount = bank.filter((question) => question.type === 'quantitative').length;
  const verbalCount = bank.filter((question) => question.type === 'verbal').length;
  const progress = user ? recomputeProgress(user.progress || emptyProgress()) : emptyProgress();

  function update(nextState) {
    setState(saveState(nextState));
  }

  function updateCurrentUserProgress(nextProgress) {
    update({
      ...state,
      users: state.users.map((item) => (
        item.username === user.username ? { ...item, progress: recomputeProgress(nextProgress) } : item
      ))
    });
  }

  function signup() {
    if (!auth.username.trim() || !auth.password) return alert('اكتب اسم المستخدم وكلمة المرور.');
    if (state.users.some((item) => item.username === auth.username.trim())) return alert('اسم المستخدم موجود.');
    const username = auth.username.trim();
    update({
      ...state,
      currentUser: username,
      users: [...state.users, { username, password: auth.password, createdAt: new Date().toISOString(), progress: emptyProgress() }]
    });
    setView('home');
  }

  function login() {
    const found = state.users.find((item) => item.username === auth.username.trim() && item.password === auth.password);
    if (!found) return alert('بيانات الدخول غير صحيحة.');
    update({ ...state, currentUser: found.username });
    setView('home');
  }

  function logout() {
    update({ ...state, currentUser: null });
    setView('home');
  }

  function addQuestionsAsFile(name, rawQuestions) {
    const existing = new Set(bank.map((question) => normalizeText(question.question)));
    const reportData = { accepted: 0, rejected: 0, quantitative: 0, verbal: 0, duplicates: 0, reasons: [] };
    const questions = [];

    rawQuestions.forEach((raw, index) => {
      const result = validateAndNormalizeQuestion(raw, name);
      if (!result.question) {
        reportData.rejected += 1;
        reportData.reasons.push(`${name} - السؤال ${index + 1}: ${result.errors.join('، ')}`);
        return;
      }
      const key = normalizeText(result.question.question);
      if (existing.has(key)) {
        reportData.duplicates += 1;
        return;
      }
      existing.add(key);
      questions.push(result.question);
      reportData.accepted += 1;
      reportData[result.question.type] += 1;
    });

    if (questions.length) {
      update({
        ...state,
        questionFiles: [...state.questionFiles, { name, createdAt: new Date().toISOString(), count: questions.length, questions }]
      });
    }
    setImportReport(reportData);
  }

  async function importFiles(files) {
    const combinedReport = { accepted: 0, rejected: 0, quantitative: 0, verbal: 0, duplicates: 0, reasons: [] };
    const existing = new Set(bank.map((question) => normalizeText(question.question)));
    const newFiles = [];

    for (const file of [...files]) {
      try {
        const data = JSON.parse(await file.text());
        const list = Array.isArray(data) ? data : Array.isArray(data.questions) ? data.questions : null;
        if (!list) throw new Error('الملف لا يحتوي مصفوفة أسئلة');
        const questions = [];

        list.forEach((raw, index) => {
          const result = validateAndNormalizeQuestion(raw, file.name);
          if (!result.question) {
            combinedReport.rejected += 1;
            combinedReport.reasons.push(`${file.name} - السؤال ${index + 1}: ${result.errors.join('، ')}`);
            return;
          }
          const key = normalizeText(result.question.question);
          if (existing.has(key)) {
            combinedReport.duplicates += 1;
            return;
          }
          existing.add(key);
          questions.push(result.question);
          combinedReport.accepted += 1;
          combinedReport[result.question.type] += 1;
        });

        if (questions.length) {
          newFiles.push({ name: file.name, createdAt: new Date().toISOString(), count: questions.length, questions });
        }
      } catch (error) {
        combinedReport.rejected += 1;
        combinedReport.reasons.push(`${file.name}: ${error.message}`);
      }
    }

    update({ ...state, questionFiles: [...state.questionFiles, ...newFiles] });
    setImportReport(combinedReport);
  }

  function deleteQuestionBank() {
    if (!confirm('حذف بنك الأسئلة كاملًا؟')) return;
    update({ ...state, questionFiles: [] });
    setImportReport(null);
  }

  function downloadTemplate() {
    const template = [{
      id: 'Q-0001',
      type: 'quantitative',
      section: 'كمي',
      skill: 'النسبة',
      difficulty: 'medium',
      question: 'نص السؤال',
      choices: ['الخيار الأول', 'الخيار الثاني', 'الخيار الثالث', 'الخيار الرابع'],
      correctAnswer: 'الخيار الأول',
      explanation: 'شرح مختصر للإجابة.',
      tags: ['وسم']
    }];
    downloadFile('question-bank-template.json', JSON.stringify(template, null, 2));
  }

  function loadDemoBank() {
    addQuestionsAsFile('demo-bank.json', sampleQuestions);
  }

  function startTest(mode, overrideQuestions = null) {
    if (!user) {
      setView('auth');
      return;
    }
    const allowedType = mode === 'quantitative' ? 'quantitative' : mode === 'verbal' ? 'verbal' : null;
    const source = overrideQuestions || (allowedType ? bank.filter((question) => question.type === allowedType) : bank);
    if (!source.length) return alert('لا توجد أسئلة مناسبة لهذا الاختبار.');
    const questions = [...source].sort(() => Math.random() - 0.5).slice(0, Math.min(20, source.length));
    setSession({ mode, questions, index: 0, answers: [] });
    setReport(null);
    setAnalysisDrafts({});
    setView('test');
  }

  function recordAnswer(choice, reason = '') {
    if (!session) return;
    const question = session.questions[session.index];
    const answer = {
      ...question,
      student: choice || 'لم يجب',
      ok: Boolean(choice) && choice === question.correctAnswer,
      reason,
      date: new Date().toISOString()
    };
    const answers = [...session.answers, answer];

    if (session.index + 1 >= session.questions.length) {
      const test = { id: Date.now(), mode: session.mode, date: new Date().toISOString(), answers };
      updateCurrentUserProgress({ ...progress, testHistory: [...progress.testHistory, test] });
      setReport(test);
      setSession(null);
      setView('report');
      return;
    }

    setSession({ ...session, index: session.index + 1, answers });
  }

  function saveMistakeAnalysis(answer) {
    const draft = analysisDrafts[answer.id] || {};
    const reason = draft.reason || answer.reason || 'ف';
    const correction = String(draft.correction || '').trim();
    if (!correction) return alert('اكتب التصحيح بسطر واحد.');

    const currentMistakes = progress.wrongQuestions || [];
    const old = currentMistakes.find((item) => item.id === answer.id);
    const mistake = {
      ...answer,
      reason,
      reasonLabel: ERROR_REASONS[reason],
      correction,
      count: old ? old.count + 1 : 1,
      savedAt: new Date().toISOString()
    };
    const nextMistakes = old
      ? currentMistakes.map((item) => (item.id === answer.id ? mistake : item))
      : [...currentMistakes, mistake];
    updateCurrentUserProgress({ ...progress, wrongQuestions: nextMistakes });
  }

  function deleteMistake(id) {
    updateCurrentUserProgress({ ...progress, wrongQuestions: progress.wrongQuestions.filter((item) => item.id !== id) });
  }

  function retryMistake(mistake) {
    startTest('retry', [mistake]);
  }

  function exportProgress() {
    downloadFile(`${APP_NAME}-progress.json`, JSON.stringify({ appName: APP_NAME, user }, null, 2));
  }

  function exportCsv() {
    const rows = ['date,mode,total,score'];
    progress.testHistory.forEach((test) => rows.push(`${test.date},${test.mode},${test.answers.length},${scoreOf(test)}%`));
    downloadFile('test-results.csv', rows.join('\n'), 'text/csv;charset=utf-8');
  }

  const currentQuestion = session?.questions[session.index];
  const wrongAnswers = report?.answers.filter((answer) => !answer.ok) || [];

  return (
    <>
      <header className="topbar">
        <button className="brand" onClick={() => setView('home')}>{APP_NAME}</button>
        <div className="actions">
          {user ? (
            <>
              <button onClick={() => setView('bank')}>إدارة البنك</button>
              <button onClick={() => setView('mistakes')}>دفتر الأخطاء</button>
              <button onClick={exportProgress}>تصدير التقدم</button>
              <button onClick={exportCsv}>تصدير Excel</button>
              <button onClick={logout}>خروج</button>
            </>
          ) : (
            <button onClick={() => setView('auth')}>دخول / حساب جديد</button>
          )}
        </div>
      </header>

      <main className="container">
        {!user && view !== 'auth' ? (
          <section className="panel hero">
            <div>
              <p className="eyebrow">جاهز للاستخدام اليومي</p>
              <h1>{APP_NAME}</h1>
              <p>أنشئ حسابًا محليًا، ارفع بنك الأسئلة، وابدأ الاختبار.</p>
            </div>
            <button className="primary" onClick={() => setView('auth')}>ابدأ الآن</button>
          </section>
        ) : null}

        {view === 'auth' ? (
          <section className="panel form">
            <h1>تسجيل الدخول</h1>
            <input placeholder="اسم المستخدم" value={auth.username} onChange={(event) => setAuth({ ...auth, username: event.target.value })} />
            <input placeholder="كلمة المرور" type="password" value={auth.password} onChange={(event) => setAuth({ ...auth, password: event.target.value })} />
            <div className="row">
              <button className="primary" onClick={login}>دخول</button>
              <button onClick={signup}>إنشاء حساب</button>
            </div>
          </section>
        ) : null}

        {user && view === 'home' ? (
          <>
            <section className="hero">
              <div>
                <p className="eyebrow">مرحبًا {user.username}</p>
                <h1>{APP_NAME}</h1>
              </div>
            </section>
            <section className="stats">
              <div><span>الاختبارات</span><strong>{progress.completedTests}</strong></div>
              <div><span>آخر درجة</span><strong>{progress.lastScore}%</strong></div>
              <div><span>أعلى درجة</span><strong>{progress.highestScore}%</strong></div>
              <div><span>المحلولة</span><strong>{progress.totalQuestions}</strong></div>
            </section>
            <section className="grid">
              <button onClick={() => startTest('quantitative')}>اختبار كمي</button>
              <button onClick={() => startTest('verbal')}>اختبار لفظي</button>
              <button onClick={() => startTest('mixed')}>تدريب مختلط</button>
              <button onClick={() => setView('bank')}>إدارة بنك الأسئلة</button>
              <button onClick={() => setView('mistakes')}>دفتر الأخطاء</button>
            </section>
          </>
        ) : null}

        {user && view === 'bank' ? (
          <section className="panel">
            <div className="row spread">
              <h1>إدارة بنك الأسئلة</h1>
              <button onClick={() => setView('home')}>رجوع</button>
            </div>
            <div className="row">
              <button onClick={downloadTemplate}>تحميل نموذج JSON</button>
              <button onClick={loadDemoBank}>تحميل بنك تجريبي</button>
              <button className="danger-button" onClick={deleteQuestionBank}>حذف بنك الأسئلة كاملًا</button>
            </div>
            <label className="drop">
              ارفع ملفات JSON
              <input type="file" accept=".json,application/json" multiple onChange={(event) => importFiles(event.target.files)} />
            </label>
            {importReport ? (
              <div className="report">
                <p>عدد المقبول: {importReport.accepted}</p>
                <p>عدد المرفوض: {importReport.rejected}</p>
                <p>عدد الكمي: {importReport.quantitative}</p>
                <p>عدد اللفظي: {importReport.verbal}</p>
                <p>التكرارات المحذوفة: {importReport.duplicates}</p>
                {importReport.reasons.length ? <pre>{importReport.reasons.join('\n')}</pre> : null}
              </div>
            ) : null}
            <table>
              <thead><tr><th>الملف</th><th>الإجمالي</th><th>الكمي</th><th>اللفظي</th></tr></thead>
              <tbody>
                {state.questionFiles.map((file) => (
                  <tr key={file.name}>
                    <td>{file.name}</td>
                    <td>{file.count}</td>
                    <td>{file.questions.filter((question) => question.type === 'quantitative').length}</td>
                    <td>{file.questions.filter((question) => question.type === 'verbal').length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}

        {view === 'test' && currentQuestion ? (
          <section className="panel">
            <div className="row spread">
              <div>
                <p className="eyebrow">{session.mode === 'quantitative' ? 'اختبار كمي' : session.mode === 'verbal' ? 'اختبار لفظي' : 'تدريب مختلط'}</p>
                <h1>السؤال {session.index + 1} من {session.questions.length}</h1>
              </div>
              <Timer questionId={currentQuestion.id} onTimeout={() => recordAnswer('', 'و')} />
            </div>
            <article className="question">
              <p>{typeLabel(currentQuestion.type)} - {currentQuestion.category} - {currentQuestion.difficulty}</p>
              <h2>{currentQuestion.question}</h2>
              <div className="choices">
                {currentQuestion.choices.map((choice) => (
                  <button key={choice} onClick={() => recordAnswer(choice)}>{choice}</button>
                ))}
              </div>
            </article>
          </section>
        ) : null}

        {view === 'report' && report ? (
          <section className="panel">
            <div className="row spread">
              <h1>نتيجة الاختبار: {scoreOf(report)}%</h1>
              <button onClick={() => setView('home')}>الرئيسية</button>
            </div>
            {wrongAnswers.length ? <h2>تحليل الأخطاء</h2> : <p className="ok-text">لا توجد أخطاء في هذا الاختبار.</p>}
            {wrongAnswers.map((answer) => {
              const draft = analysisDrafts[answer.id] || {};
              return (
                <article className="answer bad" key={answer.id}>
                  <h2>{answer.question}</h2>
                  <p>إجابة الطالب: {answer.student}</p>
                  <p>الإجابة الصحيحة: {answer.correctAnswer}</p>
                  <p>الشرح: {answer.explanation}</p>
                  <label>سبب الخطأ
                    <select value={draft.reason || answer.reason || 'ف'} onChange={(event) => setAnalysisDrafts({ ...analysisDrafts, [answer.id]: { ...draft, reason: event.target.value } })}>
                      {Object.entries(ERROR_REASONS).map(([key, label]) => <option value={key} key={key}>{key} = {label}</option>)}
                    </select>
                  </label>
                  <input placeholder="اكتب التصحيح بسطر واحد" value={draft.correction || ''} onChange={(event) => setAnalysisDrafts({ ...analysisDrafts, [answer.id]: { ...draft, correction: event.target.value } })} />
                  <button className="primary" onClick={() => saveMistakeAnalysis(answer)}>حفظ التحليل</button>
                </article>
              );
            })}
          </section>
        ) : null}

        {user && view === 'mistakes' ? (
          <section className="panel">
            <div className="row spread">
              <h1>دفتر الأخطاء</h1>
              <button onClick={() => setView('home')}>رجوع</button>
            </div>
            <table>
              <thead><tr><th>التاريخ</th><th>النوع</th><th>التصنيف</th><th>السبب</th><th>التصحيح</th><th>التكرار</th><th>إجراء</th></tr></thead>
              <tbody>
                {progress.wrongQuestions.map((mistake) => (
                  <tr key={mistake.id}>
                    <td>{new Date(mistake.savedAt || mistake.date).toLocaleDateString('ar-SA')}</td>
                    <td>{typeLabel(mistake.type)}</td>
                    <td>{mistake.category}</td>
                    <td>{mistake.reason} = {ERROR_REASONS[mistake.reason]}</td>
                    <td>{mistake.correction}</td>
                    <td>{mistake.count || 1}</td>
                    <td className="table-actions">
                      <button onClick={() => retryMistake(mistake)}>إعادة حل</button>
                      <button className="danger-button" onClick={() => deleteMistake(mistake.id)}>حذف</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}
      </main>

      <footer className="footer">
        <span>الكمي: {quantitativeCount} سؤال</span>
        <span>اللفظي: {verbalCount} سؤال</span>
        <span>ملفات JSON: {state.questionFiles.length}</span>
        <strong>الإجمالي: {bank.length} سؤال</strong>
      </footer>
    </>
  );
}
