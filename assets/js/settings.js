/* ============ 设置（接口密钥 / 城市 / 安装） ============ */
window.Settings = (function () {
  function render(c) {
    const K = API.K;
    const v = k => App.get(k, '');
    let html =
      '<div class="page-head"><h2>设置</h2><div class="date">接入真实数据</div></div>' +
      '<div class="card"><div class="section-title">天气</div>' +
        '<div class="field"><label>城市（用于真实天气）</label><input id="set-city" value="' + escapeHtml(v(K.weatherCity) || '上海') + '" placeholder="如：上海 / 北京 / 杭州" style="border:1px solid var(--line);border-radius:10px;padding:8px;width:100%"/></div></div>' +
      '<div class="card"><div class="section-title">今日医药要闻</div>' +
        '<div class="field"><label>新闻接口</label><select id="set-news" style="border:1px solid var(--line);border-radius:10px;padding:8px;width:100%">' +
          '<option value="rss">公开 RSS 聚合（免费·无需 key）</option>' +
          '<option value="tianapi">天行数据 tianapi（更稳定·需 key）</option></select></div>' +
        '<div class="field"><label>天行数据 AppKey</label><input id="set-tianapi" type="password" value="' + escapeHtml(v(K.tianapiKey)) + '" placeholder="在 tianapi.com 免费申请" style="border:1px solid var(--line);border-radius:10px;padding:8px;width:100%"/></div>' +
        '<div class="muted text-xs">选「天行数据」并填有效 AppKey（控制台需开通「<b>健康经纬</b>」接口）即可<b>实时更新</b>医药要闻——该接口已支持浏览器直连，无需代理。同一 Key 还可用于「投资机会参考」（需额外开通「<b>财经新闻</b>」）和「今日娱乐热点」（需「<b>体育</b>」「<b>科学探索</b>」）。RSS 模式为公开源聚合，受网络限制可能回退示例。</div></div>' +
      '<div class="card"><div class="section-title">逻辑口语 · 大模型（OpenAI 兼容）</div>' +
        '<div class="muted text-xs" style="margin:-2px 0 8px;line-height:1.7">✅ 国内接口（硅基流动 / 月之暗面 / DeepSeek）已开启<b>浏览器跨域</b>，可<b>直接填 Key 使用、无需任何代理</b>。点下面一键填入：</div>' +
        '<div class="row" style="gap:6px;margin-bottom:10px">' +
          '<button class="chip" data-pre="sf" style="flex:1;justify-content:center">硅基流动</button>' +
          '<button class="chip" data-pre="moonshot" style="flex:1;justify-content:center">月之暗面</button>' +
          '<button class="chip" data-pre="deepseek" style="flex:1;justify-content:center">DeepSeek</button></div>' +
        '<div class="field"><label>接口地址 Base URL</label><input id="set-llmbase" value="' + escapeHtml(v(K.llmBase) || 'https://api.siliconflow.cn/v1') + '" placeholder="https://api.siliconflow.cn/v1" style="border:1px solid var(--line);border-radius:10px;padding:8px;width:100%"/></div>' +
        '<div class="field"><label>模型</label><input id="set-llmmodel" value="' + escapeHtml(v(K.llmModel) || 'deepseek-ai/DeepSeek-V3') + '" placeholder="deepseek-ai/DeepSeek-V3" style="border:1px solid var(--line);border-radius:10px;padding:8px;width:100%"/></div>' +
        '<div class="field"><label>API Key</label><input id="set-llmkey" type="password" value="' + escapeHtml(v(K.llmKey)) + '" placeholder="sk-...（本地保存，仅发往你填写的接口）" style="border:1px solid var(--line);border-radius:10px;padding:8px;width:100%"/></div>' +
        '<div class="field"><label>跨域代理转发</label><select id="set-llmproxy" style="border:1px solid var(--line);border-radius:10px;padding:8px;width:100%">' +
          '<option value="0">关闭（推荐：用上方国内接口直连）</option>' +
          '<option value="1">开启（填写下方你自己的代理地址）</option></select></div>' +
        '<div class="field"><label>自定义代理地址（开启代理后必填）</label><input id="set-llmproxyurl" value="' + escapeHtml(v(K.llmProxyUrl)) + '" placeholder="如 https://你的代理域名/?url=" style="border:1px solid var(--line);border-radius:10px;padding:8px;width:100%"/></div>' +
        '<div class="muted text-xs"><b>OpenAI / Anthropic</b> 等海外接口在浏览器中会被跨域(CORS)拦截、且国内网络通常不可达，请勿直接填（会一直本地估算）。要用的话必须开启代理并填你自己的代理地址。</div></div>' +
      '<div class="card"><div class="section-title">英语朗读 TTS（可选·更自然）</div>' +
        '<div class="muted text-xs" style="margin:-2px 0 8px;line-height:1.7">' +
          '① 默认用手机/浏览器<b>英式女声</b>朗读，离线可用，无需配置。<br>' +
          '② 想要播音级自然感情/连读，可接入 <b>OpenAI 兼容 TTS</b>（如 OpenAI tts-1，或自建/代理）：填 Base URL、Key、模型、音色后保存，朗读自动走云端。<br>' +
          '③ 想要<b>英式女声</b>：浏览器朗读已是英式女声；云端 TTS 音色由服务商决定（OpenAI 自带偏美式），若需 en-GB 女声，请把 Base URL 指向支持 en-GB 的网关（如 Azure / Edge TTS 的 OpenAI 兼容接口），并填对应 en-GB 女声音色名。</div>' +
        '<div class="field"><label>启用云端 TTS</label><select id="set-ttson" style="border:1px solid var(--line);border-radius:10px;padding:8px;width:100%">' +
          '<option value="0">关闭（用浏览器英式女声）</option><option value="1">开启（用云端 TTS）</option></select></div>' +
        '<div class="field"><label>Base URL</label><input id="set-ttsbase" value="' + escapeHtml(v(K.ttsBase) || 'https://api.openai.com/v1') + '" placeholder="https://api.openai.com/v1" style="border:1px solid var(--line);border-radius:10px;padding:8px;width:100%"/></div>' +
        '<div class="field"><label>模型</label><input id="set-ttsmodel" value="' + escapeHtml(v(K.ttsModel) || 'tts-1') + '" placeholder="tts-1" style="border:1px solid var(--line);border-radius:10px;padding:8px;width:100%"/></div>' +
        '<div class="field"><label>API Key</label><input id="set-ttskey" type="password" value="' + escapeHtml(v(K.ttsKey)) + '" placeholder="sk-...（本地保存）" style="border:1px solid var(--line);border-radius:10px;padding:8px;width:100%"/></div>' +
        '<div class="field"><label>音色 Voice</label><input id="set-ttsvoice" value="' + escapeHtml(v(K.ttsVoice) || 'alloy') + '" placeholder="alloy / en-GB-SoniaNeural / ..." style="border:1px solid var(--line);border-radius:10px;padding:8px;width:100%"/></div>' +
        '<button class="btn sm mt8" id="set-ttstest">测试朗读</button></div>' +
      '<div class="card"><div class="section-title">投资机会参考 · 数据源</div>' +
        '<div class="field"><label>数据来源</label><select id="set-invest" style="border:1px solid var(--line);border-radius:10px;padding:8px;width:100%">' +
          '<option value="rotate">示例·每日轮换（默认·离线可用）</option>' +
          '<option value="live">实时财经 RSS（需联网）</option></select></div>' +
        '<div class="muted text-xs">默认每天轮换示例内容，保证每天不一样；选择"实时"会尝试拉取财经 RSS（东方财富/新浪等），失败自动回退示例。</div></div>' +
      '<button class="btn block mt12" id="set-save">保存设置</button>' +
      '<button class="btn block mt12 ghost" id="set-install">安装到桌面 / 手机</button>' +
      '<div class="muted text-xs mt12">所有密钥仅保存在本机浏览器 localStorage，不会上传到除你填写的接口之外的任何地方。</div>';
    c.innerHTML = html;

    document.getElementById('set-news').value = v(K.newsMode) || 'rss';
    document.getElementById('set-ttson').value = v(K.ttsOn) ? '1' : '0';
    document.getElementById('set-llmproxy').value = v(K.llmProxy) ? '1' : '0';
    const presets = {
      sf: { base: 'https://api.siliconflow.cn/v1', model: 'deepseek-ai/DeepSeek-V3' },
      moonshot: { base: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
      deepseek: { base: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
    };
    c.querySelectorAll('[data-pre]').forEach(b => {
      b.onclick = () => {
        const p = presets[b.dataset.pre]; if (!p) return;
        document.getElementById('set-llmbase').value = p.base;
        document.getElementById('set-llmmodel').value = p.model;
        App.toast('已填入「' + b.textContent + '」的地址与模型，填 Key 即可用 ✓');
      };
    });
    document.getElementById('set-invest').value = v(K.investMode) || 'rotate';

    document.getElementById('set-save').onclick = () => {
      API.setCfg(K.weatherCity, document.getElementById('set-city').value.trim() || '上海');
      API.setCfg(K.newsMode, document.getElementById('set-news').value);
      API.setCfg(K.tianapiKey, document.getElementById('set-tianapi').value.trim());
      API.setCfg(K.llmBase, document.getElementById('set-llmbase').value.trim() || 'https://api.siliconflow.cn/v1');
      API.setCfg(K.llmModel, document.getElementById('set-llmmodel').value.trim() || 'deepseek-ai/DeepSeek-V3');
      API.setCfg(K.llmKey, document.getElementById('set-llmkey').value.trim());
      API.setCfg(K.llmProxy, document.getElementById('set-llmproxy').value === '1');
      API.setCfg(K.llmProxyUrl, document.getElementById('set-llmproxyurl').value.trim());
      API.setCfg(K.ttsOn, document.getElementById('set-ttson').value === '1');
      API.setCfg(K.ttsBase, document.getElementById('set-ttsbase').value.trim() || 'https://api.openai.com/v1');
      API.setCfg(K.ttsModel, document.getElementById('set-ttsmodel').value.trim() || 'tts-1');
      API.setCfg(K.ttsKey, document.getElementById('set-ttskey').value.trim());
      API.setCfg(K.ttsVoice, document.getElementById('set-ttsvoice').value.trim() || 'alloy');
      API.setCfg(K.investMode, document.getElementById('set-invest').value);
      App.dset('weatherCache', null); // 城市变了，天气重新拉
      App.toast('设置已保存 ✓');
    };
    document.getElementById('set-ttstest').onclick = () => {
      if (window.__ttsTest) window.__ttsTest('Hello, this is a British English voice.');
      else App.toast('朗读模块未就绪');
    };
    document.getElementById('set-install').onclick = () => { if (window.__installApp) window.__installApp(); else App.toast('请通过浏览器菜单"添加到主屏幕"安装'); };
  }

  function escapeHtml(s) { return (s || '').replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m])); }

  App.register('settings', render);
  return {};
})();
