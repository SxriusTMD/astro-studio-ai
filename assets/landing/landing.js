const navToggle=document.querySelector('.nav-toggle');const nav=document.querySelector('.site-nav');navToggle?.addEventListener('click',()=>{const open=nav.classList.toggle('open');navToggle.setAttribute('aria-expanded',String(open))});nav?.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>nav.classList.remove('open')));
const tabs=[...document.querySelectorAll('[data-tool]')];const cards=[...document.querySelectorAll('[data-tool-card]')];tabs.forEach(tab=>tab.addEventListener('click',()=>{tabs.forEach(t=>{t.classList.toggle('active',t===tab);t.setAttribute('aria-selected',String(t===tab))});cards.forEach(c=>c.classList.toggle('active',c.dataset.toolCard===tab.dataset.tool));document.querySelector(`[data-tool-card="${tab.dataset.tool}"]`)?.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'})}));
document.querySelectorAll('.preview-button').forEach(button=>button.addEventListener('click',()=>{const card=button.closest('.tool-card');tabs.find(t=>t.dataset.tool===card.dataset.toolCard)?.click();card.animate([{transform:'translateY(-3px)'},{transform:'translateY(-8px)'},{transform:'translateY(-3px)'}],{duration:420})}));
document.querySelectorAll('.comparison-grid article').forEach(article=>{const compare=article.querySelector('.compare');const input=article.querySelector('input[type="range"]');if(!compare||!input)return;const update=()=>compare.style.setProperty('--split',input.value+'%');input.addEventListener('input',update);update()});
const dialog=document.querySelector('#demoDialog');document.querySelector('#demoButton')?.addEventListener('click',()=>dialog.showModal());document.querySelector('.dialog-close')?.addEventListener('click',()=>dialog.close());dialog?.addEventListener('click',event=>{if(event.target===dialog)dialog.close()});
document.querySelector('#earlyAccessForm')?.addEventListener('submit',async event=>{event.preventDefault();const form=event.currentTarget;const note=form.querySelector('.form-note');const button=form.querySelector('button[type="submit"]');if(!button||button.disabled)return;const data=new FormData(form);const payload={email:String(data.get('email')||''),role:String(data.get('role')||''),mainPain:String(data.get('mainPain')||''),source:'landing',website:String(data.get('website')||'')};const originalLabel=button.textContent;button.disabled=true;button.textContent='Submitting request...';note.classList.remove('success');note.textContent='Sending your early access request...';try{const response=await fetch('/api/early-access/leads',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});if(!response.ok)throw new Error('Request rejected');note.textContent='Request received. We’ll contact selected creators as the prototype opens.';note.classList.add('success');button.textContent='Request received';form.reset()}catch(error){note.textContent='Could not submit right now. Please check the form and try again.';button.disabled=false;button.textContent=originalLabel}});

(()=>{
  const input=document.querySelector('#textureLiteInput');
  const originalPreview=document.querySelector('#textureLiteOriginal');
  const optimizedPreview=document.querySelector('#textureLiteOptimized');
  const originalSize=document.querySelector('#textureLiteOriginalSize');
  const optimizedSize=document.querySelector('#textureLiteOptimizedSize');
  const reduction=document.querySelector('#textureLiteReduction');
  const dimensions=document.querySelector('#textureLiteDimensions');
  const status=document.querySelector('#textureLiteStatus');
  const download=document.querySelector('#textureLiteDownload');
  if(!input||!originalPreview||!optimizedPreview||!download)return;

  const allowedTypes=new Set(['image/png','image/jpeg','image/webp']);
  const maxBytes=25*1024*1024;
  const maxEdge=4096;
  let originalUrl='';
  let optimizedUrl='';
  let optimizedBlob=null;
  let outputName='textureshrink-lite.webp';

  const formatBytes=bytes=>{
    if(bytes<1024)return `${bytes} B`;
    if(bytes<1024*1024)return `${(bytes/1024).toFixed(1)} KB`;
    return `${(bytes/(1024*1024)).toFixed(2)} MB`;
  };
  const setStatus=(message,type='')=>{
    status.textContent=message;
    status.classList.remove('error','success');
    if(type)status.classList.add(type);
  };
  const revokeUrls=()=>{
    if(originalUrl)URL.revokeObjectURL(originalUrl);
    if(optimizedUrl)URL.revokeObjectURL(optimizedUrl);
    originalUrl='';optimizedUrl='';
  };
  const resetOutput=()=>{
    revokeUrls();
    optimizedBlob=null;
    originalPreview.removeAttribute('src');originalPreview.hidden=true;
    optimizedPreview.removeAttribute('src');optimizedPreview.hidden=true;
    originalSize.textContent='—';optimizedSize.textContent='—';
    reduction.textContent='—';dimensions.textContent='—';
    reduction.classList.remove('positive','negative');
    download.disabled=true;
  };
  const canvasToBlob=(canvas,quality)=>new Promise((resolve,reject)=>{
    canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('WebP encoding is not available in this browser.')),'image/webp',quality);
  });
  const loadImage=file=>new Promise((resolve,reject)=>{
    const image=new Image();
    const url=URL.createObjectURL(file);
    image.onload=()=>{URL.revokeObjectURL(url);resolve(image)};
    image.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('The selected image could not be decoded.'))};
    image.src=url;
  });

  input.addEventListener('change',async()=>{
    const file=input.files?.[0];
    if(!file)return;
    resetOutput();
    if(!allowedTypes.has(file.type)){
      setStatus('Choose a PNG, JPG or WebP image.','error');
      input.value='';return;
    }
    if(file.size>maxBytes){
      setStatus('This prototype accepts files up to 25 MB.','error');
      input.value='';return;
    }

    try{
      setStatus('Processing locally in this browser…');
      const image=await loadImage(file);
      const scale=Math.min(1,maxEdge/Math.max(image.naturalWidth,image.naturalHeight));
      const width=Math.max(1,Math.round(image.naturalWidth*scale));
      const height=Math.max(1,Math.round(image.naturalHeight*scale));
      const canvas=document.createElement('canvas');
      canvas.width=width;canvas.height=height;
      const context=canvas.getContext('2d',{alpha:true});
      if(!context)throw new Error('Canvas is not available in this browser.');
      context.imageSmoothingEnabled=true;
      context.imageSmoothingQuality='high';
      context.drawImage(image,0,0,width,height);

      let blob=await canvasToBlob(canvas,.78);
      if(blob.size>=file.size)blob=await canvasToBlob(canvas,.62);
      if(blob.size>=file.size)blob=await canvasToBlob(canvas,.45);
      optimizedBlob=blob;
      originalUrl=URL.createObjectURL(file);
      optimizedUrl=URL.createObjectURL(blob);
      originalPreview.src=originalUrl;originalPreview.hidden=false;
      optimizedPreview.src=optimizedUrl;optimizedPreview.hidden=false;
      originalSize.textContent=formatBytes(file.size);
      optimizedSize.textContent=formatBytes(blob.size);
      const saved=((file.size-blob.size)/file.size)*100;
      reduction.textContent=saved>=0?`${saved.toFixed(1)}% smaller`:`${Math.abs(saved).toFixed(1)}% larger`;
      reduction.classList.toggle('positive',saved>0);
      reduction.classList.toggle('negative',saved<=0);
      dimensions.textContent=`${width} × ${height} WebP`;
      outputName=`${file.name.replace(/\.[^.]+$/,'') || 'texture'}-lite.webp`;
      download.disabled=false;
      setStatus(saved>0?'Local compression complete. Review the preview before downloading.':'Converted locally, but this source was already smaller. Review before downloading.','success');
    }catch(error){
      setStatus(error instanceof Error?error.message:'Could not process this texture.','error');
    }
  });

  download.addEventListener('click',()=>{
    if(!optimizedBlob||!optimizedUrl)return;
    const link=document.createElement('a');
    link.href=optimizedUrl;link.download=outputName;
    document.body.appendChild(link);link.click();link.remove();
  });
})();
