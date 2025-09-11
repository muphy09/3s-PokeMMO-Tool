import React from 'react';

export const DEFAULT_METHOD_COLORS = {
  grass:'#19c254ff', 'dark grass':'#004d0dff', cave:'#482816ff', water:'#2263faff',
  fishing:'#4ac6dfff','old rod':'#7fb9f0ff','good rod':'#3e9ae9ff','super rod':'#0a61e4ff',
  horde:'#fca996ff', rocks:'#616161','rock smash':'#616161', headbutt:'#FF7F50',
  tree:'#C2A83E','swampy grass':'#16A085','npc interaction':'#8E9AAF', interaction:'#8E9AAF',
  building:'#5C7AEA', inside:'#5C7AEA', outside:'#43BCCD', special:'#F4B400',
  'dust cloud':'#A1887F', 'honey tree':'#EAB308', shadow:'#9E9E9E'
};

export const DEFAULT_RARITY_COLORS = {
  'very common':'#fbfafaff','common':'#969696ff','uncommon':'#97e9b9ff','rare':'#eb9438cb',
  'very rare':'#ff8800ff','horde':'#fca996ff','lure':'#cb1f2dff','special':'#F4B400',
  'level':'#9e50aaff','held item':'#f8e473ff'
};

export const ColorContext = React.createContext({
  methodColors: DEFAULT_METHOD_COLORS,
  rarityColors: DEFAULT_RARITY_COLORS,
  setMethodColors: () => {},
  setRarityColors: () => {}
});
