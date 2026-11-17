"use strict";
setTimeout(()=>{
 const menu=document.getElementById("mobile-menu-toggle"),nav=document.getElementById("primary-links");
 const btn=menu?.getBoundingClientRect(),art=document.querySelector(".mini-app")?.getBoundingClientRect();
 const navLink=[...document.querySelectorAll("#primary-links a")].map(a=>a.getBoundingClientRect().height);
 const report={width:innerWidth,scrollWidth:document.documentElement.scrollWidth,
 menuVisible:!!menu&&getComputedStyle(menu).display!=="none",
 menuHeight:btn?Math.round(btn.height):0,heroWidth:art?Math.round(art.width):0,
 form:!!document.getElementById("interest-form"),
 demo:!!document.querySelector('a[href*="nexus-crm-preview.pages.dev"]'),
 navLinks:navLink.length};
 if(menu&&nav){
  menu.click();
  report.menuOpens=menu.getAttribute("aria-expanded")==="true" && nav.classList.contains("open");
  report.openNavTouchTargets=[...nav.querySelectorAll("a")].map(a=>Math.round(a.getBoundingClientRect().height));
  menu.click();
  report.menuCloses=menu.getAttribute("aria-expanded")==="false" && !nav.classList.contains("open");
 }
 const pre=document.createElement("pre");pre.id="mobile-qa-result";pre.textContent=JSON.stringify(report);document.body.append(pre);
},450);
