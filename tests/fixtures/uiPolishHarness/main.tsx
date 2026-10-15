import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../../src/index.css';
import '../../../src/glass-theme.css';
import '../../../src/glass.css';
import '../../../src/light-theme.css';
import '../../../src/light-theme-pages.css';
import '../../../src/course/courseTheme.css';
import '../../../src/home/home.css';
import '../../../src/components/store-marketplace.css';
import '../../../src/components/marketplace-card-shared.css';
import '../../../src/course/courseResourceLibrary.css';
import HeroCarousel from '../../../src/home/components/HeroCarousel';
import Header from '../../../src/components/Header';
import HomeHeader from '../../../src/home/components/Header';
import DesktopShell from '../../../src/components/DesktopShell';
import StoreProductCard from '../../../src/components/StoreProductCard';
import BranchedMenu from '../../../src/components/branched-menu/BranchedMenu';
import CourseBrainPanel from '../../../src/course/CourseBrainPanel';
import { products } from '../homeMobileLayoutHarness/products';
const noop = () => {};
const params = new URLSearchParams(location.search);
const name = 'A very long note or mind map title '.repeat(6);
function Cards() {
 const [favorite, setFavorite] = useState(false);
 return <StoreProductCard large product={products[0]} wishlisted={favorite} inCart={false} purchased={false} onToggleWishlist={() => setFavorite(!favorite)} onAddToCart={noop} onView={noop} />;
}
function Libraries() {
 const [items] = useState([{value:'module',label:name, dataAttrs:{'data-course-library-module':'module'}, children:[0,1].map(i=>({value:`note${i}`, label:name, tag:{label:'SELF',color:'#777'},meta:'15 nodes',onRename:noop,onDelete:noop}))}]);
 const [open, setOpen] = useState(new Set(['module']));
 return <div className="course-player-shell course-library__menu" data-course-theme="light" style={{width:'100%',height:500,overflow:'auto',background:'#fff',padding:12}}><BranchedMenu fullWidth items={items} openValues={open} onToggle={(id,on)=>setOpen(on?new Set([id]):new Set())} ariaLabel="Long names" /></div>;
}
function Content() {
 if(params.has('library')) return <Libraries/>;
 if(params.has('brain')) return <div className="course-player-shell" data-course-theme="light" style={{height:600}}><CourseBrainPanel productId="test" sets={[{id:'one',title:name,moduleId:'module',moduleTitle:'Algebra',questions:[{id:'q1',question:'Two plus two?',options:['4','3'],correctIndex:0}]}] as any} /></div>;
 return <><div data-home-content><HeroCarousel banners={[{id:'hero',image:products[0].image,eyebrow:'Learn',title:'Your next course',subtitle:'Focused learning',cta:'Explore',gradient:'from-indigo-600 to-violet-600',linkType:'none'}]}/><div data-home-grid className="dc-home-marketplace-grid" style={{display:'grid'}}><Cards/></div></div><section data-store-page data-store-marketplace><div data-store-grid className="dc-marketplace-grid"><Cards/></div></section></>;
}
function App() {
 if(params.has('library') || params.has('brain')) return <div data-app-frame><Content/></div>;
 if(params.has('desktop')) return <DesktopShell active="home" pageTitle="Home" onSearch={noop}><Content/></DesktopShell>;
 return <div data-app-frame><HomeHeader userName="Learner" query="" onQueryChange={noop} suggestions={[]} onSelectSuggestion={noop} favoritesCount={0}/><Header title="Library" cartCount={0} notifCount={0} onNavigateToCart={noop} onNavigateToNotifications={noop} onNavigateToSubscription={noop}/><div style={{paddingTop:180}}><Content/></div></div>;
}
createRoot(document.getElementById('root')!).render(<App/>);
