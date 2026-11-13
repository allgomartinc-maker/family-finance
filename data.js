// Default pictures + Dari names. Admin can add/remove grocery items in the app.

export const GROCERY = [
  ['meat', '🥩', 'گوشت'], ['chicken', '🍗', 'مرغ'], ['fish', '🐟', 'ماهی'],
  ['rice', '🍚', 'برنج'], ['flour', '🌾', 'آرد'], ['bread', '🫓', 'نان'],
  ['oil', '🫗', 'روغن'], ['beans', '🫘', 'لوبیا'], ['dal', '🥘', 'دال'],
  ['potato', '🥔', 'کچالو'], ['tomato', '🍅', 'بادنجان رومی'], ['onion', '🧅', 'پیاز'],
  ['garlic', '🧄', 'سیر'], ['carrot', '🥕', 'زردک'], ['cucumber', '🥒', 'بادرنگ'],
  ['pepper', '🌶️', 'مرچ'], ['lemon', '🍋', 'لیمو'], ['apple', '🍎', 'سیب'],
  ['banana', '🍌', 'کیله'], ['egg', '🥚', 'تخم'], ['milk', '🥛', 'شیر'],
  ['yogurt', '🥣', 'ماست'], ['cheese', '🧀', 'پنیر'], ['tea', '🍵', 'چای'],
  ['sugar', '🍬', 'بوره'], ['salt', '🧂', 'نمک'], ['soap', '🧼', 'صابون'],
  ['tissue', '🧻', 'دستمال'], ['baby', '👶', 'پمپرز'],
].map(([id, icon, name], ord) => ({ id, icon, name, ord }));

export const OUT_CATS = [
  ['food', '🛒', 'سودا'], ['rent', '🏠', 'کرایه خانه'], ['power', '⚡', 'برق'],
  ['water', '💧', 'آب'], ['gas', '🔥', 'گاز'], ['net', '📶', 'انترنت'],
  ['phone', '📱', 'تیلفون'], ['car', '🚗', 'موتر'], ['health', '💊', 'دوا'],
  ['school', '📚', 'مکتب'], ['clothes', '👕', 'لباس'], ['guest', '🎉', 'مهمانی'],
  ['other', '❓', 'دیگر'],
].map(([id, icon, name]) => ({ id, icon, name }));

export const IN_CATS = [
  ['salary', '💼', 'معاش'], ['work', '🔨', 'کار'], ['shop', '🏪', 'دکان'],
  ['family', '👨‍👩‍👧', 'فامیل'], ['gift', '🎁', 'تحفه'], ['other', '❓', 'دیگر'],
].map(([id, icon, name]) => ({ id, icon, name }));

export const BILL_KINDS = OUT_CATS.filter((c) =>
  ['power', 'water', 'gas', 'net', 'phone', 'rent', 'school'].includes(c.id));

export const FACES = ['👨', '👩', '🧔', '👵', '👴', '👦', '👧', '🧑', '👳', '🧕', '👶', '👱'];

export const PICKER = ['🍞', '🥜', '🍯', '🫒', '🥬', '🍆', '🍇', '🍉', '🍊', '🥭', '🍑', '🌽',
  '🥐', '🍪', '🧃', '🥤', '🧈', '🍝', '🫑', '🥦', '🍐', '🥥', '🧴', '🪥', '🧽', '🧹', '🕯️', '🔋'];
