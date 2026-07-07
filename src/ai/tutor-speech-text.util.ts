import { TutorSpokenLanguage } from './tutor-language.util';

function formatFractionForSpeech(
  numerator: string,
  denominator: string,
  language: TutorSpokenLanguage,
): string {
  const isGreek = language === 'el';
  const simpleFractions: Record<string, { en: string; el: string }> = {
    '1/2': { en: 'one half', el: 'ένα δεύτερο' },
    '1/3': { en: 'one third', el: 'ένα τρίτο' },
    '2/3': { en: 'two thirds', el: 'δύο τρίτα' },
    '1/4': { en: 'one quarter', el: 'ένα τέταρτο' },
    '3/4': { en: 'three quarters', el: 'τρία τέταρτα' },
  };
  const key = `${numerator}/${denominator}`;
  const known = simpleFractions[key];
  if (known) return isGreek ? known.el : known.en;
  return isGreek ? `${numerator} προς ${denominator}` : `${numerator} over ${denominator}`;
}

/** Convert tutor display text (incl. LaTeX) into natural speech for TTS engines. */
export function prepareTutorSpeechText(text: string, language: TutorSpokenLanguage): string {
  const isGreek = language === 'el';
  let out = text;

  out = out.replace(/`([^`]+)`/g, '$1');
  out = out.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  out = out.replace(/[""''«»„“]/g, '');
  out = out.replace(/\$\$([\s\S]*?)\$\$/g, '$1');
  out = out.replace(/(?<!\$)\$([^$\n]+?)\$(?!\$)/g, '$1');

  const frac = (_: string, numerator: string, denominator: string) =>
    formatFractionForSpeech(numerator.trim(), denominator.trim(), language);

  out = out.replace(/\\dfrac\{([^{}]+)\}\{([^{}]+)\}/g, frac);
  out = out.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, frac);
  out = out.replace(/(\d+)\s*\/\s*(\d+)/g, (_, numerator: string, denominator: string) =>
    formatFractionForSpeech(numerator, denominator, language),
  );

  out = out.replace(/\\sqrt\{([^{}]+)\}/g, (_, value: string) =>
    isGreek ? `τετραγωνική ρίζα του ${value.trim()}` : `square root of ${value.trim()}`,
  );
  out = out.replace(/\\pm/g, isGreek ? ' συν ή μείον ' : ' plus or minus ');
  out = out.replace(/\\cdot|\\times/g, isGreek ? ' επί ' : ' times ');
  out = out.replace(/\\div/g, isGreek ? ' δια ' : ' divided by ');
  out = out.replace(/\\leq/g, isGreek ? ' μικρότερο ή ίσο ' : ' less than or equal to ');
  out = out.replace(/\\geq/g, isGreek ? ' μεγαλύτερο ή ίσο ' : ' greater than or equal to ');
  out = out.replace(/\\neq/g, isGreek ? ' διάφορο του ' : ' not equal to ');
  out = out.replace(/\\pi\b/g, isGreek ? ' πι ' : ' pi ');
  out = out.replace(/\\left|\\right/g, '');
  out = out.replace(/\\text\{([^{}]*)\}/g, '$1');
  out = out.replace(/\\[a-zA-Z]+/g, ' ');

  out = out.replace(/\(([^()]+)\)\s*\^2/g, (_, value: string) =>
    isGreek ? `${value.trim()}, όλο στο τετράγωνο` : `${value.trim()}, all squared`,
  );
  out = out.replace(
    /([A-Za-zΑ-Ωα-ω0-9]+)\s*\^2\b/g,
    (_, base: string) => (isGreek ? `${base} στο τετράγωνο` : `${base} squared`),
  );
  out = out.replace(
    /([A-Za-zΑ-Ωα-ω0-9]+)\s*\^3\b/g,
    (_, base: string) => (isGreek ? `${base} στον κύβο` : `${base} cubed`),
  );
  out = out.replace(
    /([A-Za-zΑ-Ωα-ω0-9]+)\s*\^([4-9]|[1-9][0-9]+)\b/g,
    (_, base: string, power: string) =>
      isGreek ? `${base} στη δύναμη ${power}` : `${base} to the power of ${power}`,
  );
  out = out.replace(
    /([A-Za-zΑ-Ωα-ω0-9]+)\s*\^\{([^{}]+)\}/g,
    (_, base: string, power: string) =>
      isGreek ? `${base} στη δύναμη ${power.trim()}` : `${base} to the power of ${power.trim()}`,
  );

  out = out.replace(/\bm\/s\b/g, isGreek ? 'μέτρα ανά δευτερόλεπτο' : 'meters per second');
  out = out.replace(/\bN\b/g, isGreek ? 'Νιούτον' : 'newtons');
  out = out.replace(/\bJ\b/g, isGreek ? 'Τζάουλ' : 'joules');

  out = out.replace(/(\d{1,3}),(\d{3})\b/g, '$1$2');
  out = out.replace(
    /(?<=[0-9A-Za-zΑ-Ωα-ω])\s*=\s*(?=[0-9A-Za-zΑ-Ωα-ω(])/g,
    isGreek ? ' ισούται με ' : ' equals ',
  );
  out = out.replace(
    /(?<=[0-9A-Za-zΑ-Ωα-ω])\s*\+\s*(?=[0-9A-Za-zΑ-Ωα-ω(])/g,
    isGreek ? ' συν ' : ' plus ',
  );
  out = out.replace(
    /(?<=[0-9A-Za-zΑ-Ωα-ω])\s*-\s*(?=[0-9A-Za-zΑ-Ωα-ω(])/g,
    isGreek ? ' μείον ' : ' minus ',
  );
  out = out.replace(/×/g, isGreek ? ' επί ' : ' times ');
  out = out.replace(/÷/g, isGreek ? ' δια ' : ' divided by ');

  out = out.replace(/[{}\[\]|\\]/g, ' ');
  out = out.replace(/\s*[,;]\s*/g, ' ');
  out = out.replace(/\s+/g, ' ').trim();
  return out;
}
