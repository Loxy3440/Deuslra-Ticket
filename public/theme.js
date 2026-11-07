// Tema: sistem ayarını izler, kullanıcı seçerse hatırlar. <head> içinde yüklenir (ekran yanıp sönmesin diye).
(function () {
  var KEY = 'dd_theme';
  function stored() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function apply(t) { document.documentElement.dataset.theme = t; }
  var sys = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  apply(stored() || sys);
  window.toggleTheme = function () {
    var next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    apply(next);
    try { localStorage.setItem(KEY, next); } catch (e) { /* tarayıcı engellediyse sorun değil */ }
  };
})();
