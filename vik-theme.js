(function(){
  const labels={normal:"Normal",dark:"Oscura",warm:"Cálida"};
  const order=["normal","dark","warm"];
  const storageKey="vik-theme";

  function current(){
    const saved=localStorage.getItem(storageKey);
    return labels[saved]?saved:"normal";
  }

  function apply(theme){
    const next=labels[theme]?theme:"normal";
    document.documentElement.dataset.theme=next;
    localStorage.setItem(storageKey,next);

    document.querySelectorAll("[data-theme-toggle]").forEach(button=>{
      button.dataset.themeCurrent=next;
      button.setAttribute("aria-label",`Cambiar tema. Actual: ${labels[next]}`);
      button.setAttribute("title",`Tema actual: ${labels[next]}`);
      button.innerHTML=`
        <span class="theme-dot" aria-hidden="true"></span>
        <span class="theme-copy">
          <span class="theme-main">Tema</span>
          <span class="theme-sub">${labels[next]}</span>
        </span>
      `;
    });
  }

  function cycle(){
    const theme=current();
    const index=order.indexOf(theme);
    apply(order[(index+1)%order.length]);
  }

  document.addEventListener("click",event=>{
    const button=event.target.closest("[data-theme-toggle]");
    if(button){
      event.preventDefault();
      cycle();
    }
  });

  window.addEventListener("storage",event=>{
    if(event.key===storageKey)apply(event.newValue||"normal");
  });

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",()=>apply(current()),{once:true});
  }else{
    apply(current());
  }
})();
