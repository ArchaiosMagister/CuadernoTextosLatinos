import { fingerprintForMark, validateEdition } from './edition-validation.js';
/** Operaciones puras: no escriben IndexedDB, no actualizan HTML ni consumen bancos. */
export class EditionOperationError extends Error {
    constructor(message) { super(message); this.name = 'EditionOperationError'; }
}
function fail(message) { throw new EditionOperationError(message); }
function placement(e, id) {
    const p = e.placements.find(x => x.id === id);
    return p ?? fail('Aparición inexistente: ' + id);
}
function question(p, id) {
    return p.questions.find(q => q.id === id) ?? fail('Pregunta inexistente: ' + id);
}
function choiceQuestion(p, id) {
    const q = question(p, id);
    if (q.kind !== 'choice')
        fail('La pregunta no es de elección: ' + id);
    return q;
}
function replacePlacement(e, id, edit, at) {
    // Primero se comprueba que el destino exista. No se crea por error.
    placement(e, id);
    return validateEdition({ ...e, updatedAt: at, placements: e.placements.map(p => p.id === id ? edit(p) : p) });
}
export function appendPlacement(e, p, at) {
    return validateEdition({ ...e, updatedAt: at, placements: [...e.placements, p] });
}
export function scorePlacement(p) {
    return p.questions.reduce((sum, q) => sum + (q.enabled ? q.pointsHundredths : 0), 0);
}
const cardinal = ['cero', 'una', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez'];
function word(n) { return cardinal[n] ?? String(n); }
/** Nunca se almacena la frase «dos de cuatro» como una constante desincronizable. */
export function choiceHeading(q) {
    const rendered = q.statement.value || 'Elige {required} de estas {offered} preguntas:';
    return rendered.replaceAll('{required}', word(q.requiredCount)).replaceAll('{offered}', word(q.options.filter(o => o.enabled).length));
}
/** Una sesión de vista previa es efímera y no altera la edición. */
export function moveSession(e, s, command) {
    if (e.id !== s.activeEditionId)
        fail('La sesión pertenece a otro cuaderno');
    if (command === 'whole')
        return { ...s, mode: 'whole-notebook' };
    if (typeof command === 'object') {
        placement(e, command.placementId);
        return { ...s, mode: 'text', activePlacementId: command.placementId };
    }
    const current = e.placements.findIndex(p => p.id === s.activePlacementId);
    if (current < 0) {
        const first = e.placements[0];
        return { ...s, mode: 'text', activePlacementId: first?.id ?? null };
    }
    const next = Math.max(0, Math.min(e.placements.length - 1, current + (command === 'next' ? 1 : -1)));
    return { ...s, mode: 'text', activePlacementId: e.placements[next]?.id ?? null };
}
export function movePlacement(e, id, toIndex, at) {
    const index = e.placements.findIndex(x => x.id === id);
    if (index < 0)
        fail('Aparición inexistente');
    if (!Number.isInteger(toIndex) || toIndex < 0 || toIndex >= e.placements.length)
        fail('Posición fuera de rango');
    const next = [...e.placements];
    next.splice(index, 1);
    next.splice(toIndex, 0, e.placements[index]);
    return validateEdition({ ...e, updatedAt: at, placements: next });
}
/** El título, autor, cita y latín de esta aparición son independientes del Corpus original. */
export function editPlacementText(e, placementId, key, value, at) {
    return replacePlacement(e, placementId, p => {
        const editedText = { ...p.text, [key]: value };
        if (key === 'latin') {
            if (typeof value !== 'string')
                fail('El texto latino no puede ser nulo');
            const newLatin = value;
            // El contrato V1 exige offsets dentro de la longitud UTF-16 del texto.
            // No podemos recortar un anclaje y mantener sus coordenadas inválidas.
            // Nunca se descarta silenciosamente la marca ni el análisis docente:
            // primero debe retirarse/reanclarse de forma explícita (operación futura).
            if (p.text.markup.some(mark => mark.endUtf16 > newLatin.length)) {
                fail('La edición recorta un subrayado fuera del texto. Revisa o retira primero las marcas afectadas.');
            }
            editedText.markup = p.text.markup.map(m => ({ ...m,
                reviewRequired: m.reviewRequired
                    || newLatin.slice(m.startUtf16, m.endUtf16) !== m.exact
                    || fingerprintForMark(newLatin, m.startUtf16, m.endUtf16) !== m.textFingerprint,
            }));
            const marksInReview = new Set(editedText.markup.filter(m => m.reviewRequired).map(m => m.id));
            return { ...p, text: editedText, questions: p.questions.map(q => q.kind === 'morphology'
                    ? { ...q, words: q.words.map(w => marksInReview.has(w.markId) && w.reviewState === 'verified'
                            ? { ...w, reviewState: 'needs-review' } : w) } : q) };
        }
        return { ...p, text: editedText };
    }, at);
}
export function toggleOption(e, placementId, questionId, optionId, enabled, at) {
    return replacePlacement(e, placementId, p => {
        const q = choiceQuestion(p, questionId);
        if (!q.options.some(x => x.id === optionId))
            fail('Apartado inexistente');
        return { ...p, questions: p.questions.map(item => item.id !== questionId ? item :
                { ...q, options: q.options.map(opt => opt.id === optionId ? { ...opt, enabled } : opt) }) };
    }, at);
}
export function toggleQuestion(e, placementId, questionId, enabled, at) {
    return replacePlacement(e, placementId, p => {
        question(p, questionId);
        return { ...p, questions: p.questions.map(q => q.id === questionId ? { ...q, enabled } : q) };
    }, at);
}
export function editOptionStatement(e, placementId, questionId, optionId, value, at) {
    return replacePlacement(e, placementId, p => {
        const q = choiceQuestion(p, questionId);
        if (!q.options.some(o => o.id === optionId))
            fail('Apartado inexistente');
        return { ...p, questions: p.questions.map(item => item.id !== questionId ? item : { ...q,
                options: q.options.map(o => o.id === optionId ? { ...o, statement: { value, origin: 'manual', locked: true, lastEditAt: at } } : o) }) };
    }, at);
}
export function editSlotManual(e, placementId, questionId, optionId, slotId, value, at) {
    return replacePlacement(e, placementId, p => {
        const q = choiceQuestion(p, questionId);
        const opt = q.options.find(o => o.id === optionId) ?? fail('Apartado inexistente');
        if (!opt.slots.some(w => w.id === slotId))
            fail('Palabra inexistente');
        return { ...p, questions: p.questions.map(item => item.id !== questionId ? item : { ...q,
                options: q.options.map(o => o.id !== optionId ? o : { ...o,
                    slots: o.slots.map(w => w.id === slotId ? { ...w, value, origin: 'manual', locked: true } : w) }) }) };
    }, at);
}
export function editMorphManual(e, placementId, questionId, morphWordId, analysis, at) {
    return replacePlacement(e, placementId, p => {
        const q = question(p, questionId);
        if (q.kind !== 'morphology')
            fail('No es pregunta de morfología');
        if (!q.words.some(w => w.id === morphWordId))
            fail('Palabra morfológica inexistente');
        return { ...p, questions: p.questions.map(item => item.id !== questionId ? item : { ...q,
                words: q.words.map(w => w.id === morphWordId ? { ...w, analysis, reviewState: 'manual', locked: true } : w) }) };
    }, at);
}
export function setQuestionPoints(e, placementId, questionId, pointsHundredths, at) {
    return replacePlacement(e, placementId, p => {
        question(p, questionId);
        return { ...p, questions: p.questions.map(q => q.id === questionId ? { ...q, pointsHundredths } : q) };
    }, at);
}
export function editQuestionStatement(e, placementId, questionId, value, at) {
    return replacePlacement(e, placementId, p => {
        question(p, questionId);
        return { ...p, questions: p.questions.map(q => q.id === questionId ? { ...q, statement: { value, origin: 'manual', locked: true, lastEditAt: at } } : q) };
    }, at);
}
export function editVocabulary(e, placementId, vocabularyId, field, value, at) {
    return replacePlacement(e, placementId, p => {
        if (!p.vocabulary.some(w => w.id === vocabularyId))
            fail('Entrada de vocabulario inexistente');
        return { ...p, vocabulary: p.vocabulary.map(w => w.id === vocabularyId
                ? { ...w, [field]: value, origin: 'manual', locked: true, reviewState: 'manual' } : w) };
    }, at);
}
function assertCandidate(c) {
    if (!c.provenance)
        fail('No se sustituye una palabra con una propuesta sin fuente verificada');
    if (!c.value.trim())
        fail('La palabra propuesta está vacía');
}
/** Regeneración con aislamiento de una única palabra y preservación de ID y posición. */
export function regenerateSlot(e, placementId, questionId, optionId, slotId, candidate, at, replaceLocked = false) {
    assertCandidate(candidate);
    return replacePlacement(e, placementId, p => {
        const q = choiceQuestion(p, questionId);
        const opt = q.options.find(o => o.id === optionId) ?? fail('Apartado inexistente');
        const slot = opt.slots.find(w => w.id === slotId) ?? fail('Palabra inexistente');
        if (slot.locked && !replaceLocked)
            fail('Palabra bloqueada manualmente: solicitar confirmación');
        return { ...p, questions: p.questions.map(item => item.id !== questionId ? item : { ...q,
                options: q.options.map(o => o.id !== optionId ? o : { ...o,
                    slots: o.slots.map(w => w.id !== slotId ? w : { ...w, ...candidate, origin: 'generated', locked: false }) }) }) };
    }, at);
}
/** No mueve el subrayado: cambia solo el análisis de una aparición ya anclada. */
export function regenerateMorph(e, placementId, questionId, morphWordId, candidate, at, replaceLocked = false) {
    if (candidate.reviewState === 'verified' && !candidate.provenance)
        fail('Análisis sin evidencia verificable');
    if (candidate.reviewState === 'manual')
        fail('Una regeneración automática no puede producir una decisión manual');
    return replacePlacement(e, placementId, p => {
        const q = question(p, questionId);
        if (q.kind !== 'morphology')
            fail('No es pregunta de morfología');
        const existing = q.words.find(w => w.id === morphWordId) ?? fail('Palabra morfológica inexistente');
        if (existing.locked && !replaceLocked)
            fail('Análisis bloqueado manualmente');
        const mark = p.text.markup.find(m => m.id === existing.markId);
        if (mark.reviewRequired)
            fail('La marca necesita revisión antes de regenerar');
        return { ...p, questions: p.questions.map(item => item.id !== questionId ? item : { ...q,
                words: q.words.map(w => w.id !== morphWordId ? w : { ...w, ...candidate, locked: false }) }) };
    }, at);
}
/** Subapartado: candidato completo sin modificar otro subapartado ni puntuaciones. */
export function regenerateSubquestion(e, placementId, questionId, optionId, candidates, at, lockedPolicy = 'preserve') {
    for (const c of candidates) {
        if (c.origin !== 'generated')
            fail('Una regeneración no puede crear candidatos manuales');
        assertCandidate(c);
    }
    return replacePlacement(e, placementId, p => {
        const q = choiceQuestion(p, questionId);
        const opt = q.options.find(o => o.id === optionId) ?? fail('Apartado inexistente');
        const proposedIds = new Set(candidates.map(s => s.id));
        if (proposedIds.size !== candidates.length)
            fail('Palabras con IDs repetidos');
        if (lockedPolicy === 'preserve' && opt.slots.some(w => w.locked && !proposedIds.has(w.id))) {
            fail('La regeneración eliminaría una palabra manual bloqueada');
        }
        const existingById = new Map(opt.slots.map(w => [w.id, w]));
        const slots = candidates.map(c => {
            const old = existingById.get(c.id);
            return lockedPolicy === 'preserve' && old?.locked ? old : c;
        });
        return { ...p, questions: p.questions.map(item => item.id !== questionId ? item : { ...q,
                options: q.options.map(o => o.id !== optionId ? o : { ...o, slots }) }) };
    }, at);
}
/** Pregunta completa: no se recalculan puntos, estilo, ID ni preguntas vecinas. */
export function regenerateQuestion(e, placementId, questionId, replacement, at, lockedPolicy = 'preserve') {
    return replacePlacement(e, placementId, p => {
        const old = question(p, questionId);
        if (replacement.id !== old.id || replacement.kind !== old.kind)
            fail('No puede sustituirse la identidad/tipo de pregunta');
        if (old.statement.locked && lockedPolicy === 'preserve' && old.statement.value !== replacement.statement.value) {
            fail('Enunciado protegido por edición manual');
        }
        if (old.kind === 'morphology' && replacement.kind === 'morphology' && lockedPolicy === 'preserve') {
            const oldWords = new Map(old.words.map(w => [w.id, w]));
            if (old.words.some(w => w.locked && !replacement.words.some(n => n.id === w.id)))
                fail('La propuesta elimina análisis manual protegido');
            if (replacement.words.some(w => oldWords.get(w.id)?.locked && JSON.stringify(w) !== JSON.stringify(oldWords.get(w.id)))) {
                fail('La propuesta cambia análisis manual protegido');
            }
        }
        if (old.kind === 'choice' && replacement.kind === 'choice') {
            const existingSlots = new Map(old.options.flatMap(o => o.slots).map(w => [w.id, w]));
            for (const proposed of replacement.options.flatMap(o => o.slots)) {
                if (proposed.origin === 'generated')
                    assertCandidate(proposed);
                else if (JSON.stringify(existingSlots.get(proposed.id)) !== JSON.stringify(proposed)) {
                    fail('Una regeneración no puede crear o modificar una palabra manual');
                }
            }
        }
        if (old.kind === 'choice' && replacement.kind === 'choice' && lockedPolicy === 'preserve') {
            if (old.options.some(o => o.statement.locked && !replacement.options.some(n => n.id === o.id && JSON.stringify(n.statement) === JSON.stringify(o.statement)))) {
                fail('La propuesta cambia un enunciado protegido');
            }
            const beforeSlots = old.options.flatMap(o => o.slots).filter(w => w.locked);
            const nextSlots = replacement.options.flatMap(o => o.slots);
            if (beforeSlots.some(w => !nextSlots.some(n => n.id === w.id && JSON.stringify(n) === JSON.stringify(w)))) {
                fail('La propuesta cambia o elimina una palabra protegida');
            }
        }
        const safe = { ...replacement, id: old.id, kind: old.kind,
            pointsHundredths: old.pointsHundredths, styleOverride: old.styleOverride, enabled: old.enabled,
            statement: old.statement.locked && lockedPolicy === 'preserve' ? old.statement : replacement.statement };
        return { ...p, questions: p.questions.map(q => q.id === questionId ? safe : q) };
    }, at);
}
/** La vista previa y el menú escribirán exactamente este mismo agregado. */
export function snapshotEdition(e) {
    return JSON.stringify(validateEdition(e));
}
/** Valor persistente que no depende de la posición en el cuaderno. */
export function listPlacementIds(e) { return e.placements.map(p => p.id); }
/** Actualización de vocabulario manual sin fuente inventada. */
export function insertManualVocabulary(e, placementId, entry, at) {
    if (entry.origin !== 'manual' || entry.reviewState !== 'manual')
        fail('La nueva entrada manual debe declararse como tal');
    return replacePlacement(e, placementId, p => ({ ...p, vocabulary: [...p.vocabulary, entry] }), at);
}
/** Cabecera editorial sin duplicar la cadena de preguntas del modelo. */
export function questionDisplayText(q) {
    return q.kind === 'choice' ? choiceHeading(q) : q.statement.value;
}
