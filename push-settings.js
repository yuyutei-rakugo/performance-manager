export function mountPushSettings(menu, cloud) {
  const section = menu.querySelector('[data-push-settings]');
  const toggle = section.querySelector('[data-push-toggle]');
  const test = section.querySelector('[data-push-test]');
  const status = section.querySelector('[role=status]');
  let state, busy = false;
  const request = (action, fields) => cloud.push(action, fields);
  const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const options = subscription => ({endpoint:subscription.endpoint, keys:subscription.toJSON().keys});

  async function manage(action) {
    if (busy) return;
    busy = true;
    toggle.disabled = test.disabled = true;
    status.textContent = '確認中…';
    try {
      if (!supported()) throw Error('iPhoneではホーム画面に追加して開いてください。それ以外では対応するブラウザをご利用ください。');
      if (action === 'enable' && Notification.permission !== 'granted') {
        // Permission must be requested directly from the member's click.
        if (await Notification.requestPermission() !== 'granted') throw Error('端末の設定で通知を許可してください。');
      }
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration?.active) throw Error('帳面を開き直してからお試しください。');
      let subscription = await registration.pushManager.getSubscription();
      if (action === 'enable') {
        if (!subscription) {
          const key = Uint8Array.from(atob(state.publicKey.replace(/-/g,'+').replace(/_/g,'/')), char => char.charCodeAt(0));
          subscription = await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
        }
        await request('pushEnable',options(subscription));
        status.textContent = 'この端末で通知を受け取ります。';
      } else if (action === 'disable' && subscription) {
        await request('pushDisable', options(subscription));
        await subscription.unsubscribe();
        subscription = null;
        status.textContent = 'この端末の通知を停止しました。';
      } else if (action === 'test' && subscription) {
        await request('pushTest',options(subscription));
        status.textContent = 'テスト通知を送信しました。端末の通知欄を確認してください。';
      }
      const enabled = !!subscription && (await request('pushStatus',options(subscription))).enabled;
      toggle.dataset.enabled = String(enabled);
      toggle.textContent = enabled ? 'この端末の通知を停止する' : '公演のお知らせを受け取る';
      test.hidden = !state.pilot || !enabled;
      if (action === 'status') status.textContent = enabled ? 'この端末では通知が有効です。' : 'この端末では通知が無効です。';
    } catch (error) {
      status.textContent = error.message;
    } finally {
      busy = false;
      toggle.disabled = test.disabled = false;
    }
  }
  toggle.onclick = () => manage(toggle.dataset.enabled === 'true' ? 'disable' : 'enable');
  test.onclick = () => manage('test');
  return async () => {
    section.hidden = true;
    if (!cloud.state.role || cloud.state.provider !== 'apps-script') return;
    const config = await request('pushConfig').catch(() => null);
    if (!config?.allowed || !menu.open) return;
    state = config;
    section.hidden = false;
    await manage('status');
  };
}
