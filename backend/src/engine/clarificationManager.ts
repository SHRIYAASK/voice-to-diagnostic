/**
 * Clarification Manager — ApplianceCare AI
 *
 * Generates context-aware, targeted clarification questions when essential
 * information is missing or ambiguous.
 *
 * Rules:
 * - Never asks for information already supplied in context or session history.
 * - Supports multilingual responses (EN, HI, TA).
 * - Focused strictly on advancing the workflow.
 */

export interface ClarificationQuestion {
  text: string;
  targetField: 'appliance_type' | 'symptom' | 'error_code' | 'model';
  language: 'en' | 'hi' | 'ta';
  options?: string[];
}

export const clarificationManager = {
  getQuestion(
    missingField: 'appliance_type' | 'symptom' | 'error_code' | 'model',
    language: 'en' | 'hi' | 'ta' = 'en'
  ): ClarificationQuestion {
    switch (missingField) {
      case 'appliance_type':
        if (language === 'hi') {
          return {
            text: 'Aapko kis appliance ke liye help chahiye (AC, fridge, ya washing machine)?',
            targetField: 'appliance_type',
            language: 'hi',
            options: ['AC', 'Fridge', 'Washing machine'],
          };
        }
        if (language === 'ta') {
          return {
            text: 'உங்களுக்கு எந்த appliance-ல உதவி தேவை (AC, fridge, இல்ல washing machine)?',
            targetField: 'appliance_type',
            language: 'ta',
            options: ['AC', 'Fridge', 'Washing machine'],
          };
        }
        return {
          text: 'Could you please specify which appliance you need help with (e.g., Air Conditioner, Refrigerator, or Washing Machine)?',
          targetField: 'appliance_type',
          language: 'en',
          options: ['Air Conditioner', 'Refrigerator', 'Washing Machine'],
        };

      case 'symptom':
        if (language === 'hi') {
          return {
            text: 'Aapke AC mein kya problem ho rahi hai bataiye?',
            targetField: 'symptom',
            language: 'hi',
            options: ['Cooling nahi ho rahi', 'On nahi ho raha', 'Paani leak ho raha hai'],
          };
        }
        if (language === 'ta') {
          return {
            text: 'உங்க AC-ல என்ன பிரச்சனை-ன்னு சொல்லுங்க?',
            targetField: 'symptom',
            language: 'ta',
            options: ['Cooling வரல', 'On ஆகல', 'Water leak ஆகுது'],
          };
        }
        return {
          text: 'Could you please describe what is happening with your AC?',
          targetField: 'symptom',
          language: 'en',
          options: ['Not cooling', 'Won’t turn on', 'Water leaking', 'Unusual noise'],
        };

      case 'error_code':
        if (language === 'hi') {
          return {
            text: 'क्या डिस्प्ले पर कोई एरर कोड (जैसे CH 05, CH 21) दिखाई दे रहा है?',
            targetField: 'error_code',
            language: 'hi',
          };
        }
        if (language === 'ta') {
          return {
            text: 'டிஸ்ப்ளேயில் ஏதேனும் பிழை குறியீடு (CH 05, CH 21 போன்றவை) தெரிகிறதா?',
            targetField: 'error_code',
            language: 'ta',
          };
        }
        return {
          text: 'Could you confirm if there is a specific error code showing on the display (such as CH 05 or CH 21)?',
          targetField: 'error_code',
          language: 'en',
        };

      case 'model':
        if (language === 'hi') {
          return {
            text: 'क्या आप अपने एसी का मॉडल नंबर (जैसे UW-Q18WUZA) बता सकते हैं?',
            targetField: 'model',
            language: 'hi',
          };
        }
        if (language === 'ta') {
          return {
            text: 'உங்கள் ஏசியின் மாடல் எண்ணை (எ.கா: UW-Q18WUZA) குறிப்பிட முடியுமா?',
            targetField: 'model',
            language: 'ta',
          };
        }
        return {
          text: 'Could you please provide your AC model number if available (e.g., UW-Q18WUZA)?',
          targetField: 'model',
          language: 'en',
        };
    }
  },
};

