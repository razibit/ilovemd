(function(w,d,s,l,i){
  var meta=d.querySelector('meta[name="ilovemd-analytics-mode"]');
  var mode=meta?meta.content:'disabled',consent=false;
  try{consent=localStorage.getItem('ilovemd.analytics-consent')==='granted'}catch(e){}
  var active=mode==='anonymous'||(mode==='consent'&&consent);
  w.__ILOVEMD_ANALYTICS_ACTIVE__=active;
  if(!active)return;
  w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});
  var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';
  j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;
  j.onerror=function(){w.__ILOVEMD_ANALYTICS_ACTIVE__=false};f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-WXQLRTK4');
