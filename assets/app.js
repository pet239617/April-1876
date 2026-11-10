'use strict';
(() => {
 const H = window.HISTORY;
 if (!H) return;
 const $ = (s, root = document) => root.querySelector(s);
 const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));
 const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const ext = 'target="_blank" rel="noopener noreferrer"';
 const sourceLink = (key, label = 'Прочети източника ↗') => `<a href="${H.sources[key].url}" ${ext}>${label}</a>`;
 const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

 // Navigation stays usable without an animation dependency.
 const menuToggle = $('.menu-toggle');
 const mobileNav = $('#mobile-nav');
 menuToggle.addEventListener('click', () => {
  const expanded = menuToggle.getAttribute('aria-expanded') !== 'true';
  menuToggle.setAttribute('aria-expanded', String(expanded));
  mobileNav.hidden = !expanded;
 });
 $$('a', mobileNav).forEach(a => a.addEventListener('click', () => {
  menuToggle.setAttribute('aria-expanded', 'false');
  mobileNav.hidden = true;
 }));
 document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !mobileNav.hidden) {
   mobileNav.hidden = true;
   menuToggle.setAttribute('aria-expanded', 'false');
   menuToggle.focus();
  }
 });
 if ('IntersectionObserver' in window) {
  const navLinks = $$('.desktop-nav a');
  const observer = new IntersectionObserver(entries => {
   for (const entry of entries) if (entry.isIntersecting) {
    navLinks.forEach(link => {
     const active = link.hash === '#' + entry.target.id;
     link.classList.toggle('active', active);
     if (active) link.setAttribute('aria-current', 'location'); else link.removeAttribute('aria-current');
    });
   }
  }, {rootMargin: '-15% 0px -65% 0px'});
  navLinks.forEach(a => {const el = $(a.hash); if (el) observer.observe(el);});
 }
 function keyboardTabs(container, selector, attribute, change) {
  container.addEventListener('keydown', e => {
   if (!['ArrowLeft','ArrowRight','Home','End'].includes(e.key)) return;
   const buttons = $$(selector, container);
   const i = buttons.indexOf(document.activeElement);
   if (i < 0) return;
   e.preventDefault();
   let n = i;
   if (e.key === 'ArrowLeft') n = (i - 1 + buttons.length) % buttons.length;
   if (e.key === 'ArrowRight') n = (i + 1) % buttons.length;
   if (e.key === 'Home') n = 0;
   if (e.key === 'End') n = buttons.length - 1;
   buttons[n].focus();
   change(buttons[n].dataset[attribute]);
  });
 }

 // Map data is local: no tile service, tracking or external map key is required.
 const state = {layer:'uprising', filter:'all', query:'', selected:'koprivshtitsa', calendar:'old', era:'all'};
 let map = null;
 let pointGroup = null;
 let routeGroup = null;
 let leaderGroup = null;
 const visited = new Map();
 const seenPlaces = () => {if(!visited.has(state.layer))visited.set(state.layer,new Set());return visited.get(state.layer);};
 const markers = new Map();
 const mapElement = $('#history-map');
 const placesForLayer = () => H.places.filter(p => p.layer === state.layer);
 const visiblePlaces = () => placesForLayer().filter(p => (state.filter === 'all' || p.type === state.filter) && (!state.query || (p.name+' '+p.tag).toLocaleLowerCase('bg').includes(state.query)));
 function markerIcon(p, index) {
  const selected=p.id===state.selected, seen=seenPlaces().has(p.id);
  return L.divIcon({className:'map-number-icon',html:`<span class="map-number ${p.type==='battle'?'battle':''} ${selected?'selected':''} ${seen?'visited':''}"><span>${String(index+1).padStart(2,'0')}</span>${seen&&!selected?'<i aria-hidden="true">✓</i>':''}</span>`,iconSize:[40,40],iconAnchor:[20,20]});
 }
 function updateJourney(){
  const places=visiblePlaces(), index=places.findIndex(p=>p.id===state.selected), current=places[index];
  $('#journey-title').textContent=current?current.name:'Няма намерени места';
  $('#journey-count').textContent=current?`Място ${index+1} от ${places.length} · разгледани ${places.filter(p=>seenPlaces().has(p.id)).length}`:'Промени търсенето или филтъра';
  $('#journey-prev').disabled=index<=0;$('#journey-next').disabled=index<0||index>=places.length-1;
  const count=places.filter(p=>seenPlaces().has(p.id)).length;
  $('#journey-progress').style.width=places.length?`${100*count/places.length}%`:'0%';
  const bar=$('.journey-track');bar.setAttribute('aria-valuemax',String(places.length||1));bar.setAttribute('aria-valuenow',String(count));
 }
 function layoutMarkers(){
  if(!map||!leaderGroup)return;
  leaderGroup.clearLayers();
  const places=visiblePlaces(), occupied=[];
  const ordered=[...places].sort((a,b)=>(b.id===state.selected)-(a.id===state.selected));
  ordered.forEach(p=>{
   const marker=markers.get(p.id);if(!marker)return;
   const original=map.latLngToLayerPoint([p.lat,p.lng]);let point=original;
   const candidates=[original];
   for(let radius=46;radius<=138;radius+=46)for(let i=0;i<12;i++){const angle=i*Math.PI/6;candidates.push(L.point(original.x+Math.cos(angle)*radius,original.y+Math.sin(angle)*radius));}
   point=candidates.find(candidate=>occupied.every(other=>candidate.distanceTo(other)>43))||candidates[candidates.length-1];
   occupied.push(point);const displayed=map.layerPointToLatLng(point);marker.setLatLng(displayed);
   if(point.distanceTo(original)>3){L.polyline([[p.lat,p.lng],displayed],{color:'#6c796a',weight:1,opacity:.65,interactive:false}).addTo(leaderGroup);L.circleMarker([p.lat,p.lng],{radius:2,color:'#4e6257',weight:1,fillOpacity:1,interactive:false}).addTo(leaderGroup);}
  });
  const labelBoxes=[];
  const intersects=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
  const markerBoxes=ordered.map(p=>{
   const point=map.latLngToContainerPoint(markers.get(p.id).getLatLng());
   return {id:p.id,left:point.x-23,right:point.x+23,top:point.y-23,bottom:point.y+23};
  });
  ordered.forEach(p=>{
   const marker=markers.get(p.id);if(!marker)return;const selected=p.id===state.selected;
   const point=map.latLngToContainerPoint(marker.getLatLng());const width=Math.min(220,p.name.length*6.6+23);
   const options=[
    {direction:'right',offset:[22,0],left:point.x+25,right:point.x+25+width,top:point.y-15,bottom:point.y+15},
    {direction:'left',offset:[-22,0],left:point.x-25-width,right:point.x-25,top:point.y-15,bottom:point.y+15},
    {direction:'top',offset:[0,-23],left:point.x-width/2,right:point.x+width/2,top:point.y-58,bottom:point.y-27},
    {direction:'bottom',offset:[0,23],left:point.x-width/2,right:point.x+width/2,top:point.y+27,bottom:point.y+58}
   ];
   const inside=b=>b.left>8&&b.right<map.getSize().x-40&&b.top>38&&b.bottom<map.getSize().y-45;
   const clear=b=>!labelBoxes.some(other=>intersects(b,other))&&!markerBoxes.some(other=>other.id!==p.id&&intersects(b,other));
   const best=options.find(b=>inside(b)&&clear(b));
   const chosen=best||options.find(inside)||options[0];
   const enabled=$('#map-labels').checked&&(selected||Boolean(best));
   marker.unbindTooltip();marker.bindTooltip(escapeHTML(p.name),{permanent:enabled,direction:chosen.direction,offset:chosen.offset,opacity:1,className:'place-map-label'+(selected?' active':'')});
   if(enabled){marker.openTooltip();labelBoxes.push(chosen);}
  });
 }
 function selectPlace(id, pan = true) {
  const p = H.places.find(p => p.id === id);
  if (!p) return;
  state.selected = id;
  seenPlaces().add(id);
  $$('.place-item').forEach(button => {
   const selected = button.dataset.place === id;
   button.classList.toggle('active',selected);
   button.setAttribute('aria-pressed',String(selected));
   button.classList.toggle('visited',seenPlaces().has(button.dataset.place));
  });
  placesForLayer().forEach((place, i) => {
   const marker = markers.get(place.id);
   if (marker) {
    marker.setIcon(markerIcon(place,i));
    marker.setZIndexOffset(place.id === id ? 500 : 0);
    marker.getElement()?.setAttribute('aria-label',`${place.name} — ${place.tag}. Отвори историята.`);
   }
  });
  if (map && pan) map.setView([p.lat,p.lng],Math.max(map.getZoom(),9),{animate:!reducedMotion,duration:.4});
  layoutMarkers();renderRoutes();updateJourney();
  const selectedButton=$(`[data-place="${id}"]`), list=$('#place-list');
  if(selectedButton){if(list.scrollWidth>list.clientWidth)list.scrollLeft=selectedButton.offsetLeft-(list.clientWidth-selectedButton.offsetWidth)/2;else list.scrollTop=selectedButton.offsetTop-list.offsetTop-(list.clientHeight-selectedButton.offsetHeight)/2;}
  const selectionLabel=$('#map-selection-label');if(selectionLabel)selectionLabel.textContent=p.name+' · '+p.date;
  $('#map-detail').innerHTML = `<div><p class="eyebrow">${escapeHTML(p.tag)}</p><h3>${escapeHTML(p.name)}</h3><p class="detail-date">${escapeHTML(p.date)}</p></div><div><p class="map-detail-text"><strong>${escapeHTML(p.title)}.</strong> ${escapeHTML(p.text)}</p><div class="detail-bottom">${sourceLink(p.source)}<span class="place-coordinates">${p.lat.toFixed(3)}° N · ${p.lng.toFixed(3)}° E</span></div></div>`;
 }
 function fitLayer() {
  if (!map) return;
  const places = visiblePlaces();
  if(state.layer==='uprising'&&state.filter==='all'&&!state.query)map.fitBounds([[41.2,22.25],[44.35,28.9]],{padding:[35,35],animate:!reducedMotion});
  else if(places.length===1)map.setView([places[0].lat,places[0].lng],9,{animate:!reducedMotion});
  else if(places.length>1)map.fitBounds(places.map(p=>[p.lat,p.lng]),{padding:[80,70],maxZoom:9,animate:!reducedMotion});
 }
 function renderRoutes(){
  if(!map)return;routeGroup.clearLayers();
  const visible=new Set(visiblePlaces().map(p=>p.id));
  const ids=state.layer==='botev'?placesForLayer().map(p=>p.id):state.layer==='liberation'?['svishtov','tarnovo1877','shipka']:[];
  if(ids.length<2||visible.size===0)return;
  const places=ids.map(id=>H.places.find(p=>p.id===id)), coords=places.map(p=>[p.lat,p.lng]), index=ids.indexOf(state.selected);
  L.polyline(coords,{color:'#fffdf7',weight:8,opacity:.95,interactive:false}).addTo(routeGroup);
  L.polyline(coords,{color:'#9b8470',weight:3,dashArray:'7 7',opacity:.9,interactive:false}).addTo(routeGroup);
  if(index>0)L.polyline(coords.slice(0,index+1),{color:'#783b35',weight:4,opacity:1,interactive:false}).addTo(routeGroup);
  for(let i=1;i<places.length;i++){
   const a=map.latLngToLayerPoint(coords[i-1]),b=map.latLngToLayerPoint(coords[i]),angle=Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI;
   const midpoint=map.layerPointToLatLng(L.point((a.x+b.x)/2,(a.y+b.y)/2));
   L.marker(midpoint,{interactive:false,keyboard:false,icon:L.divIcon({className:'route-direction',html:`<span style="transform:rotate(${angle}deg);color:${i<=index?'#783b35':'#8a755f'}">➤</span>`,iconSize:[20,20],iconAnchor:[10,10]})}).addTo(routeGroup);
  }
 }

 function renderPlaces({fit = false} = {}) {
  const places = visiblePlaces();
  const all = placesForLayer();
  $('#place-list').innerHTML = places.length ? places.map(p => {
   const index = all.indexOf(p);
   return `<button class="place-item ${p.id===state.selected?'active':''}" data-place="${p.id}" aria-pressed="${p.id===state.selected}"><span class="place-index">${String(index+1).padStart(2,'0')}</span><span class="place-text"><span class="place-name">${escapeHTML(p.name)}</span><span class="place-caption">${escapeHTML(p.tag)}</span></span><span aria-hidden="true">↗</span></button>`;
  }).join('') : '<p class="no-places">Няма намерени места. Опитай с друго име или избери „Всички“.</p>';
  $('#map-count').textContent = `${places.length} от ${all.length} места · избери, за да научиш повече`;
  if (map) {
   pointGroup.clearLayers();
   markers.clear();
   places.forEach(p => {
    const index = all.indexOf(p);
    const marker = L.marker([p.lat,p.lng], {icon:markerIcon(p,index),title:p.name,alt:p.name,keyboard:true,riseOnHover:true}).addTo(pointGroup);
    marker.bindTooltip(p.name,{direction:'top',offset:[0,-13],opacity:1});
    marker.on('click',() => selectPlace(p.id,true));
    markers.set(p.id,marker);
    const el = marker.getElement();
    if (el) el.setAttribute('aria-label', `${p.name} — ${p.tag}. Отвори историята.`);
   });
   renderRoutes();
  }
  if(places.length)selectPlace(places.some(p=>p.id===state.selected)?state.selected:places[0].id,false);
  else {
   state.selected=null;
   $('#map-detail').innerHTML='<p class="map-detail-text">Няма места за показване. Промени търсенето или избери друг филтър.</p>';
   $('#map-selection-label').textContent='Няма намерени места';
  }
  if (fit) fitLayer();
  layoutMarkers();updateJourney();
 }
 function changeLayer(layer) {
  if (!H.layers[layer]) return;
  state.layer=layer; state.filter='all'; state.query=''; state.selected=H.layers[layer].defaultId;
  $('#place-search').value='';
  $$('[data-layer]').forEach(button => {const active=button.dataset.layer===layer;button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;});
  $('#map-experience').setAttribute('aria-labelledby','tab-'+layer);
  $('#layer-label').textContent=H.layers[layer].label;
  $('#map-footnote').textContent=H.layers[layer].note;
  $$('[data-filter]').forEach(b=>{b.classList.toggle('active',b.dataset.filter==='all');b.setAttribute('aria-pressed',String(b.dataset.filter==='all'));});
  $('[data-filter="center"]').textContent=layer==='uprising'?'Огнища':'Места';
  $('.map-legend>span:first-child').innerHTML=`<i class="legend-dot red"></i> ${escapeHTML(H.layers[layer].legend)}`;
  $('#route-legend').hidden=layer==='uprising';
  renderPlaces({fit:true});
 }
 $('#place-list').addEventListener('click', e=>{const b=e.target.closest('[data-place]');if(b)selectPlace(b.dataset.place);});
 $$('[data-layer]').forEach(button=>button.addEventListener('click',()=>changeLayer(button.dataset.layer)));
 keyboardTabs($('.map-tabs'),'[data-layer]','layer',changeLayer);
 $$('[data-filter]').forEach(button=>button.addEventListener('click',()=>{
  state.filter=button.dataset.filter;
  $$('[data-filter]').forEach(b=>{const active=b===button;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
  renderPlaces({fit:true});
 }));
 $('#place-search').addEventListener('input',e=>{state.query=e.target.value.trim().toLocaleLowerCase('bg');renderPlaces({fit:true});});
 $('#map-reset').addEventListener('click',()=>{changeLayer(state.layer);});
 $('#map-labels').addEventListener('change',layoutMarkers);
 for(const [id,direction] of [['journey-prev',-1],['journey-next',1]])$('#'+id).addEventListener('click',()=>{const places=visiblePlaces(),index=places.findIndex(p=>p.id===state.selected);if(places[index+direction])selectPlace(places[index+direction].id);});
 function initializeMap() {
  if (!window.L) {
   mapElement.innerHTML='<p class="map-fallback-note">Картата не се зареди. Всички места и истории са достъпни от списъка.</p>';
   renderPlaces(); selectPlace(state.selected,false); return;
  }
  map=L.map(mapElement,{zoomControl:false,fadeAnimation:!reducedMotion,zoomAnimation:!reducedMotion,scrollWheelZoom:false,minZoom:5,maxZoom:12,zoomSnap:.25,attributionControl:true,maxBounds:[[39,19],[46,30]],maxBoundsViscosity:.7}).setView([42.9,24.5],7);
  L.control.zoom({position:'topright',zoomInTitle:'Приближи',zoomOutTitle:'Отдалечи'}).addTo(map);
  map.attributionControl.setPrefix(false);
  map.attributionControl.addAttribution('<a href="https://www.naturalearthdata.com/" target="_blank" rel="noopener noreferrer">Natural Earth</a> · съвременни граници');
  map.createPane('geographic-base');map.getPane('geographic-base').style.zIndex='300';
  map.createPane('geographic-labels');map.getPane('geographic-labels').style.zIndex='350';map.getPane('geographic-labels').style.pointerEvents='none';
  leaderGroup=L.layerGroup().addTo(map);routeGroup=L.layerGroup().addTo(map);pointGroup=L.layerGroup().addTo(map);
  L.control.scale({imperial:false,position:'bottomright',maxWidth:100}).addTo(map);
  map.on('zoomend moveend',()=>{layoutMarkers();renderRoutes();});
  renderPlaces();selectPlace(state.selected,false);fitLayer();
  try {
   const geo=window.HISTORY_GEOGRAPHY?.borders;
   if(!geo)throw new Error('Geographic data unavailable');
   L.geoJSON(geo,{pane:'geographic-base',interactive:false,style:f=>({fillColor:f.properties.name==='Bulgaria'?'#faf8ee':'#e3e4da',fillOpacity:1,color:f.properties.name==='Bulgaria'?'#556d58':'#b6bbac',weight:f.properties.name==='Bulgaria'?2.5:1})}).addTo(map).bringToBack();
   const labels=[{pos:[43.2,26.4],text:'БЪЛГАРИЯ',class:'country-main',w:230},{pos:[44.42,25.4],text:'РУМЪНИЯ',w:130},{pos:[42.67,21.6],text:'СЪРБИЯ',w:100},{pos:[40.95,24.05],text:'ГЪРЦИЯ',w:100},{pos:[41.25,27.5],text:'ТУРЦИЯ',w:100},{pos:[43.78,24.42],text:'Дунав',class:'natural',w:80},{pos:[42.13,28.45],text:'Черно море',class:'natural',w:120}];
   labels.forEach(label=>L.marker(label.pos,{pane:'geographic-labels',interactive:false,keyboard:false,icon:L.divIcon({className:'geo-label '+(label.class||''),html:escapeHTML(label.text),iconSize:[label.w,30],iconAnchor:[label.w/2,15]})}).addTo(map));
   const cities=[['София',42.698,23.322],['Пловдив',42.135,24.745],['Варна',43.212,27.915],['Бургас',42.504,27.462],['Русе',43.844,25.954]];
   cities.forEach(([name,lat,lng])=>L.marker([lat,lng],{pane:'geographic-labels',interactive:false,keyboard:false,icon:L.divIcon({className:'context-city',html:`<i></i><span>${name}</span>`,iconSize:[90,20],iconAnchor:[3,10]})}).addTo(map));
   if(window.HISTORY_GEOGRAPHY.rivers)L.geoJSON(window.HISTORY_GEOGRAPHY.rivers,{pane:'geographic-base',interactive:false,style:{color:'#79a6b7',weight:2,opacity:.9}}).addTo(map);
   layoutMarkers();
  } catch {
   $('.map-hint').innerHTML='<span class="map-dot"></span> Местата са достъпни; основата не се зареди.';
  }
  if('ResizeObserver' in window)new ResizeObserver(()=>map.invalidateSize({pan:false})).observe(mapElement);
 }
 renderPlaces();selectPlace(state.selected,false);
 initializeMap();

 // Biographies and film players share the native, keyboard-accessible dialog.
 const dialog=$('#story-dialog');
 const dialogContent=$('#dialog-content');
 let dialogTrigger=null;
 function openDialog(html) {
  dialogTrigger=document.activeElement;
  dialogContent.innerHTML=html;
  document.body.classList.add('dialog-open');
  dialog.showModal();
  $('.dialog-close').focus();
 }
 function closeDialog(){dialog.close();}
 $('.dialog-close').addEventListener('click',closeDialog);
 dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDialog();}});
 dialog.addEventListener('close',()=>{dialogContent.innerHTML='';document.body.classList.remove('dialog-open');dialogTrigger?.focus();});
 $('#people-grid').innerHTML=H.people.map(person=>`<article class="person-card" data-person-card="${person.id}"><button class="portrait-wrap" data-person="${person.id}" aria-haspopup="dialog" aria-label="Научи повече за ${escapeHTML(person.name)}"><img src="assets/${person.image}" alt="Архивен фотографски портрет на ${escapeHTML(person.name)}" width="400" height="560" loading="lazy"><span class="portrait-years">${person.years}</span><span class="portrait-arrow" aria-hidden="true">↗</span></button><span class="person-role">${person.role}</span><h3>${person.name}</h3><p>${person.teaser}</p><button class="person-link" data-person="${person.id}" aria-haspopup="dialog">Неговата история →</button></article>`).join('');
 // Keep the label personal and grammatically correct.
 const raynaLink=$('.person-link[data-person="rayna"]');if(raynaLink)raynaLink.textContent='Нейната история →';
 $('#people-grid').addEventListener('click',e=>{
  const button=e.target.closest('[data-person]');if(!button)return;
  const p=H.people.find(x=>x.id===button.dataset.person);
  openDialog(`<div class="person-dialog"><img src="assets/${p.image}" alt="Архивен портрет на ${escapeHTML(p.name)}"><div class="person-dialog-body"><p class="eyebrow">${p.role}</p><h2 id="dialog-title">${p.name}</h2><p class="dialog-years">${p.years}</p>${p.paragraphs.map(text=>`<p>${escapeHTML(text)}</p>`).join('')}<div class="dialog-actions"><a href="#map-section" data-go-place="${p.place}">Виж мястото на картата →</a>${sourceLink(p.source,'Исторически източник ↗')}</div><p class="dialog-image-note">${escapeHTML(p.credit)}</p></div></div>`);
 });
 dialogContent.addEventListener('click',e=>{
  const a=e.target.closest('[data-go-place]');if(!a)return;
  e.preventDefault();const place=H.places.find(p=>p.id===a.dataset.goPlace);if(!place)return;
  closeDialog();changeLayer(place.layer);selectPlace(place.id,false);
  history.replaceState(null,'','#map-section');
  $('#map-section').scrollIntoView({behavior:reducedMotion?'auto':'smooth'});
  const button=$(`[data-place="${place.id}"]`);button?.focus({preventScroll:true});
 });
 $('#more-people-grid').innerHTML=H.morePeople.map(person=>`<article class="more-person"><h3>${person.name}</h3><span>${person.role}</span><p>${person.text}</p>${sourceLink(person.source,'Прочети повече ↗')}</article>`).join('');

 // Calendar and thematic filters operate independently.
 function renderTimeline(){
  const events=H.timeline.filter(event=>state.era==='all'||event.era===state.era);
  $('#timeline-list').innerHTML=events.map(event=>`<article class="timeline-event ${event.highlight?'highlight':''}"><div class="timeline-date">${event[state.calendar]}<span>${event.year}</span></div><div class="timeline-event-content"><h3>${event.title}</h3><p>${event.text}</p>${event.note?`<p class="event-note">${event.note}</p>`:''}<a class="event-source" href="${H.sources[event.source].url}" ${ext}>${H.sources[event.source].name} ↗</a></div></article>`).join('');
  $('#calendar-note').textContent=state.calendar==='old'?'Датите са по Юлианския календар (стар стил). През XIX век разликата е 12 дни.':'Датите са по Григорианския календар (нов стил). Месечните и сезонните периоди са ориентировъчни.';
 }
 $$('[data-calendar]').forEach(button=>button.addEventListener('click',()=>{
  state.calendar=button.dataset.calendar;
  $$('[data-calendar]').forEach(b=>{const active=b===button;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});renderTimeline();
 }));
 $$('[data-era]').forEach(button=>button.addEventListener('click',()=>{
  state.era=button.dataset.era;
  $$('[data-era]').forEach(b=>{const active=b===button;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});renderTimeline();
 }));
 renderTimeline();
 function renderComparison(id='society'){
  const comparison=H.comparisons[id];if(!comparison)return;
  $$('[data-comparison]').forEach(button=>{const active=button.dataset.comparison===id;button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;});
  $('#comparison-content').setAttribute('aria-labelledby','legacy-tab-'+id);
  $('#comparison-content').innerHTML=['before','after'].map(key=>`<article class="comparison-column ${key}"><p class="comparison-label">${key==='before'?'ПРЕДИ · ДО 1876':'СЛЕД · ОТЗВУК И ПОСЛЕДИЦИ'}</p><h3>${comparison[key].title}</h3><p>${comparison[key].text}</p>${sourceLink(comparison.source,'Към историческия контекст ↗')}</article>`).join('');
 }
 $$('[data-comparison]').forEach(button=>button.addEventListener('click',()=>renderComparison(button.dataset.comparison)));
 keyboardTabs($('.comparison-tabs'),'[data-comparison]','comparison',renderComparison);
 renderComparison();

 $('#films-grid').innerHTML=H.films.map(film=>`<article class="film"><button class="film-thumb" data-video="${film.id}" aria-haspopup="dialog" aria-label="Гледай: ${escapeHTML(film.title)}"><img src="assets/${film.fallback}" data-youtube-thumbnail="${film.id}" alt="${escapeHTML(film.title)} — документален разказ на БНТ" width="640" height="400" loading="lazy"><span class="play-icon"><svg viewBox="0 0 20 24" aria-hidden="true"><path d="M1 1l18 11L1 23Z"/></svg></span><span class="film-badge">${film.date}</span></button><span class="film-kind">${film.kind}</span><h3>${film.title}</h3><p>${film.description}</p><div class="film-links"><button data-video="${film.id}" aria-haspopup="dialog">Гледай видеото →</button><a href="https://www.youtube.com/watch?v=${film.id}" ${ext}>В YouTube ↗</a></div></article>`).join('');
 $('#films-grid').addEventListener('click',e=>{
  const button=e.target.closest('[data-video]');if(!button)return;
  const film=H.films.find(f=>f.id===button.dataset.video);if(!film)return;
  const fileMode=location.protocol==='file:';
  const player=fileMode
   ? `<a class="local-video-link" href="https://www.youtube.com/watch?v=${film.id}" ${ext}><img src="assets/video-${film.id}.jpg" alt=""><span>Гледай в YouTube ↗</span></a>`
   : `<iframe src="https://www.youtube-nocookie.com/embed/${film.id}?autoplay=1&rel=0" title="${escapeHTML(film.title)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`;
  openDialog(`<div class="video-dialog"><div class="video-frame">${player}</div><h2 id="dialog-title">${film.title}</h2><p>${film.kind} · ${film.date}</p><p>${fileMode?'При отваряне от файл гледай видеото в YouTube с интернет връзка.':'Ако видеото не се възпроизвежда тук,'} <a href="https://www.youtube.com/watch?v=${film.id}" ${ext}>Отвори в YouTube ↗</a>.</p></div>`);
 });
 // Thumbnails are downloaded into the site; all image assets remain self-hosted.
 $$('[data-youtube-thumbnail]').forEach(img=>{
  const fallback=img.getAttribute('src');
  img.addEventListener('error',()=>{if(img.getAttribute('src')!==fallback)img.src=fallback;},{once:true});
  img.src=`assets/video-${img.dataset.youtubeThumbnail}.jpg`;
 });

 const sourceList=$('#history-sources');
 sourceList.innerHTML=Object.entries(H.sources).map(([key,s])=>`<li id="source-${key}"><a href="${s.url}" ${ext}>${s.name} · ${s.title}</a><small>${s.note}</small></li>`).join('');
 $('#image-credits').innerHTML=H.credits.map(c=>`<p><strong>${c.title.replace(/\.$/,'')}.</strong> ${escapeHTML(c.author).replace(/\.$/,'')}. <a href="https://commons.wikimedia.org/wiki/File:${encodeURIComponent(c.file)}" ${ext}>Оригинал и описание ↗</a> · <a href="${c.licenseUrl}" ${ext}>${c.license}</a>.</p>`).join('')+'<p><strong>Миниатюри на видеата.</strong> Българска национална телевизия / YouTube. Използвани като визуални връзки към съответните предавания; правата остават на авторите.</p>';
})();

// Reveal cited sources before the browser moves to their fragment.
document.addEventListener('click', event => {
 const link=event.target.closest('a[href^="#source-"]');
 if(!link)return;
 const target=document.getElementById(link.hash.slice(1));
 const disclosure=target?.closest('details');
 if(disclosure)disclosure.open=true;
});
function revealSourceHash(){
 if(!location.hash.startsWith('#source-'))return;
 const target=document.getElementById(location.hash.slice(1));
 const disclosure=target?.closest('details');
 if(disclosure){disclosure.open=true;requestAnimationFrame(()=>target.scrollIntoView());}
}
window.addEventListener('hashchange',revealSourceHash);
revealSourceHash();
