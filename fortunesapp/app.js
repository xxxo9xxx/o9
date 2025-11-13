// --- ユーティリティ関数 ---
function calcAge(y, m, d) {
  const today = new Date();
  let age = today.getFullYear() - y;
  const monthDiff = today.getMonth() + 1 - m;
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < d)) {
    age--;
  }
  return age;
}

// --- メインの占いエンジン ---
window.FortuneEngine = (function() {

  // 保存データのキーを定義
  const FATE_RECORDS_KEY = 'fortuneFates_v1';
  const USED_INDICES_KEY = 'fortuneUsedIndices_v1';

  // 占い済みの人の運命を取得・保存する
  function getFate(userKey) {
    const fates = JSON.parse(localStorage.getItem(FATE_RECORDS_KEY)) || {};
    return fates[userKey] || null;
  }
  function setFate(userKey, fortune) {
    const fates = JSON.parse(localStorage.getItem(FATE_RECORDS_KEY)) || {};
    fates[userKey] = fortune;
    localStorage.setItem(FATE_RECORDS_KEY, JSON.stringify(fates));
  }
  
  // カテゴリごとの使用済み占いインデックスを取得・保存する
  function getUsedIndices(categoryKey) {
    const allUsed = JSON.parse(localStorage.getItem(USED_INDICES_KEY)) || {};
    return allUsed[categoryKey] || [];
  }
  function addUsedIndex(categoryKey, index) {
    const allUsed = JSON.parse(localStorage.getItem(USED_INDICES_KEY)) || {};
    if (!allUsed[categoryKey]) {
      allUsed[categoryKey] = [];
    }
    allUsed[categoryKey].push(index);
    localStorage.setItem(USED_INDICES_KEY, JSON.stringify(allUsed));
  }
  function resetUsedIndices(categoryKey) {
    const allUsed = JSON.parse(localStorage.getItem(USED_INDICES_KEY)) || {};
    allUsed[categoryKey] = [];
    localStorage.setItem(USED_INDICES_KEY, JSON.stringify(allUsed));
  }

  function run(name, birthY, birthM, birthD, gender) {
    
    // --- STEP 1 & 2: ユーザーキー作成と履歴確認 ---
    const userKey = `${name}|${birthY}-${birthM}-${birthD}`;
    const existingFate = getFate(userKey);
    if (existingFate) {
      return existingFate; // 記録があれば、それを返して終了
    }

    // --- STEP 3: カテゴリと占いリストを決定 ---
    // 特別な名前のチェック (最優先)
    if (window.SPECIAL_FORTUNES && window.SPECIAL_FORTUNES[name]) {
      const specialFortune = window.SPECIAL_FORTUNES[name];
      setFate(userKey, specialFortune);
      return specialFortune;
    }

    // モードの読み込み
    const parentMode = sessionStorage.getItem('parentMode') === 'true';
    const teacherMode = sessionStorage.getItem('teacherMode') === 'true';

    let categoryKey;
    let listKey;
    let fortuneList;
    const age = calcAge(birthY, birthM, birthD);

    // 【保護者モード】または【先生モード】の判定
    if (parentMode) {
      categoryKey = "parents";
      listKey = "parents";
      fortuneList = window.FORTUNE_SETS[categoryKey] || [];
    } else if (teacherMode) {
      categoryKey = "teachers";
      listKey = "teachers";
      fortuneList = window.FORTUNE_SETS[categoryKey] || [];
    } else {
      // 【通常モード】年齢と性別で判定
      if (age <= 6) { categoryKey = "age_0_6"; }
      else if (age <= 9) { categoryKey = "age_7_9"; }
      else if (age <= 12) { categoryKey = "age_10_12"; }
      else if (age <= 18) { categoryKey = "age_13_17"; }
      else if (age <= 22) { categoryKey = "age_18_22"; }
      else if (age <= 29) { categoryKey = "age_23_29"; }
      else if (age <= 59) { categoryKey = "age_30_59"; }
      else { categoryKey = "age_60_plus"; }
      
      const categoryData = window.FORTUNE_SETS[categoryKey];
      if (!categoryData) { return null; }

      if (Array.isArray(categoryData)) {
        fortuneList = categoryData;
        listKey = categoryKey;
      } else if (typeof categoryData === 'object' && categoryData !== null) {
        const genderKey = categoryData[gender] ? gender : 'neutral';
        fortuneList = categoryData[genderKey] || [];
        listKey = `${categoryKey}_${genderKey}`;
      }
    }

    if (!Array.isArray(fortuneList) || fortuneList.length === 0) { 
        if (parentMode || teacherMode) {
            alert(`「${listKey}」モード用の占いデータが見つかりません。\n(fortunes-${listKey}.js を確認してください)`);
        }
        return null; 
    }

    // --- STEP 4: モードに応じてくじ引き ---
    const probVaryMode = sessionStorage.getItem('probabilityVaryMode') === 'true';
    const isTargetAge = (age >= 7 && age <= 18);
    // 保護者/先生モードでは年齢に関係なく高確率モードを適用、通常モードでは対象年齢のみ適用
    const applyProbMode = probVaryMode && (parentMode || teacherMode || isTargetAge);

    let selectedFortune;
    let originalIndex;

    // 【高確率モード】適用時
    if (applyProbMode) {
      const highLuckFortunes = fortuneList.map((f, i) => ({ fortune: f, index: i })).filter(item => item.fortune.score >= 120);
      const normalFortunes = fortuneList.map((f, i) => ({ fortune: f, index: i })).filter(item => item.fortune.score < 120);

      const usedIndices = getUsedIndices(listKey);
      let availableHigh = highLuckFortunes.filter(item => !usedIndices.includes(item.index));
      let availableNormal = normalFortunes.filter(item => !usedIndices.includes(item.index));
      
      const drawHighLuck = Math.random() < 0.30;

      if (drawHighLuck && availableHigh.length > 0) {
        const randomIndex = Math.floor(Math.random() * availableHigh.length);
        selectedFortune = availableHigh[randomIndex].fortune;
        originalIndex = availableHigh[randomIndex].index;
      } else {
        if (availableNormal.length === 0) {
            // 通常が枯渇し、高確率が残っている場合は高確率から引く
            if (availableHigh.length > 0) {
                const randomIndex = Math.floor(Math.random() * availableHigh.length);
                selectedFortune = availableHigh[randomIndex].fortune;
                originalIndex = availableHigh[randomIndex].index;
            } else {
                // 両方枯渇していたらリセット
                resetUsedIndices(listKey);
                availableNormal = normalFortunes; // リセット後のリストを再設定
                alert(`「${listKey}」の占いを使い切ったため、このカテゴリの履歴をリセットしました！`);
                // 枯渇リセット後は通常から引く
                const randomIndex = Math.floor(Math.random() * availableNormal.length);
                selectedFortune = availableNormal[randomIndex].fortune;
                originalIndex = availableNormal[randomIndex].index;
            }
        } else {
            const randomIndex = Math.floor(Math.random() * availableNormal.length);
            selectedFortune = availableNormal[randomIndex].fortune;
            originalIndex = availableNormal[randomIndex].index;
        }
      }

    } else {
      // 【通常モード】（使い切り方式）
      const usedIndices = getUsedIndices(listKey);
      let availableFortunes = fortuneList.map((f, i) => ({ fortune: f, index: i }))
                                         .filter(item => !usedIndices.includes(item.index));
      
      if (availableFortunes.length === 0) {
        resetUsedIndices(listKey);
        availableFortunes = fortuneList.map((f, i) => ({ fortune: f, index: i }));
        alert(`「${listKey}」の占いをすべて使い切ったため、履歴をリセットしました！`);
      }

      const randomIndex = Math.floor(Math.random() * availableFortunes.length);
      selectedFortune = availableFortunes[randomIndex].fortune;
      originalIndex = availableFortunes[randomIndex].index;
    }

    // --- STEP 5: 結果を記録し、返す ---
    if (selectedFortune) {
      addUsedIndex(listKey, originalIndex);
      setFate(userKey, selectedFortune);
      return selectedFortune;
    }
    
    return null; // 万が一、何も選ばれなかった場合
  }

  return { run };
})();