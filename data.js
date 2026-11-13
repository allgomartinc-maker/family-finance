// Default pictures + Dari names. Admin can add/remove grocery items in the app.

export const UNIT_OF = {'meat': 'kg', 'chicken': 'kg', 'fish': 'kg', 'rice': 'sack', 'flour': 'sack', 'bread': 'piece', 'oil': 'tin', 'beans': 'kg', 'dal': 'kg', 'potato': 'kg', 'tomato': 'kg', 'onion': 'kg', 'garlic': 'kg', 'carrot': 'kg', 'cucumber': 'kg', 'pepper': 'kg', 'lemon': 'kg', 'apple': 'kg', 'banana': 'kg', 'egg': 'dozen', 'milk': 'bottle', 'yogurt': 'pack', 'cheese': 'pack', 'tea': 'pack', 'sugar': 'kg', 'salt': 'pack', 'soap': 'piece', 'tissue': 'pack', 'baby': 'pack'};

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
].map(([id, icon, name], ord) => ({ id, icon, name, ord, unit: UNIT_OF[id] || 'piece' }));

export const OUT_CATS = [
  ['food', '🛒', 'سودا'], ['rent', '🏠', 'کرایه خانه'], ['power', '⚡', 'برق'],
  ['water', '💧', 'آب'], ['gas', '🔥', 'گاز'], ['net', '📶', 'انترنت'],
  ['phone', '📱', 'تیلفون'], ['car', '🚗', 'موتر'], ['health', '💊', 'دوا'],
  ['school', '📚', 'مکتب'], ['clothes', '👕', 'لباس'], ['guest', '🎉', 'مهمانی'],
  ['other', '❓', 'دیگر'],
].map(([id, icon, name]) => ({ id, icon, name }));

export const IN_CATS = [
  ['salary', '💼', 'معاش'], ['work', '🔨', 'کار'], ['shop', '🏪', 'دکان'],
  ['abroad', '✈️', 'از خارج'], ['family', '👨‍👩‍👧', 'فامیل'], ['gift', '🎁', 'تحفه'], ['other', '❓', 'دیگر'],
].map(([id, icon, name]) => ({ id, icon, name }));

export const BILL_KINDS = OUT_CATS.filter((c) =>
  ['power', 'water', 'gas', 'net', 'phone', 'rent', 'school'].includes(c.id));

export const FACES = ['👨', '👩', '🧔', '👵', '👴', '👦', '👧', '🧑', '👳', '🧕', '👶', '👱'];

export const PICKER = ['🍞', '🥜', '🍯', '🫒', '🥬', '🍆', '🍇', '🍉', '🍊', '🥭', '🍑', '🌽',
  '🥐', '🍪', '🧃', '🥤', '🧈', '🍝', '🫑', '🥦', '🍐', '🥥', '🧴', '🪥', '🧽', '🧹', '🕯️', '🔋'];

// How things are bought in Afghan shops. Picture first; the word is for the shopkeeper.
export const UNITS = [
  ['kg', '⚖️', 'کیلو'], ['sack', '🛍️', 'بوری'], ['tin', '🛢️', 'حلب'], ['bottle', '🍼', 'بوتل'],
  ['pack', '📦', 'بسته'], ['piece', '☝️', 'دانه'], ['dozen', '🔟', 'درجن'], ['liter', '🫙', 'لیتر'],
].map(([id, icon, name]) => ({ id, icon, name }));

// Savings goals Afghan families save for.
export const GOALS = [
  ['wedding', '💍', 'عروسی'], ['eid', '🌙', 'عید'], ['health', '🏥', 'داکتر'], ['hajj', '🕋', 'حج'],
  ['house', '🏠', 'خانه'], ['school', '🎓', 'مکتب'], ['other', '🫙', 'دیگر'],
].map(([id, icon, name]) => ({ id, icon, name }));

// Where money from abroad comes from.
export const COUNTRIES = [
  ['ir', '🇮🇷', 'ایران'], ['pk', '🇵🇰', 'پاکستان'], ['tr', '🇹🇷', 'ترکیه'], ['de', '🇩🇪', 'آلمان'], ['gb', '🇬🇧', 'انگلستان'],
  ['us', '🇺🇸', 'امریکا'], ['sa', '🇸🇦', 'عربستان'], ['ae', '🇦🇪', 'امارات'], ['other', '🌍', 'دیگر'],
].map(([id, icon, name]) => ({ id, icon, name }));

// Real photos (img/*.jpg, Unsplash licence) for the default pictures. Custom items keep their own photo or emoji.
export const PHOTO_ITEMS = new Set(['meat', 'chicken', 'fish', 'rice', 'flour', 'bread', 'oil', 'beans', 'dal', 'potato', 'tomato', 'onion', 'garlic', 'carrot', 'cucumber', 'pepper', 'lemon', 'apple', 'banana', 'egg', 'milk', 'yogurt', 'cheese', 'tea', 'sugar', 'salt', 'soap', 'tissue', 'baby']);
export const PHOTO_UNITS = new Set(['sack', 'bottle', 'kg']);
