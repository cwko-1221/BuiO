// The same inquiry and answer indexes in both languages.
export const TOPICS = ['物質'];
const editions = {
  "zh-HK": {
    "id": "air-expansion",
    "number": 7,
    "topic": "物質",
    "grades": "小三至小五",
    "minutes": 11,
    "title": "空氣的脹與縮",
    "englishTitle": "Warm Air, Cold Air",
    "color": "#5ec8b0",
    "icon": "balloon",
    "observe": {
      "title": "凹下去的乒乓球又變圓了",
      "notice": [
        "打乒乓球時，小明不小心把一個乒乓球壓凹了，但球沒有破裂或穿孔。",
        "老師把這個乒乓球放進熱水裏，過了一會兒，凹下去的位置慢慢鼓起來。",
        "沒有重新充氣，乒乓球卻恢復了原本的形狀。"
      ],
      "wonder": "沒有重新充氣，為甚麼凹下去的乒乓球遇熱後卻能恢復原狀？",
      "image": {
        "key": "ping-pong-recovery",
        "alt": "示意圖：沒有破裂的乒乓球凹下去，放進熱水後恢復圓形。",
        "captions": [
          "凹下去的乒乓球",
          "放進熱水",
          "恢復原狀"
        ]
      }
    },
    "question": "空氣受熱和遇冷時，體積會有甚麼變化？",
    "objective": "以氣球作指示，觀察密封空氣受熱膨脹、遇冷收縮。",
    "apparatus": [
      "氣球",
      "硬身的空膠樽",
      "熱水盆",
      "冰水盆",
      "熱水溫度掣"
    ],
    "curriculum": {
      "items": "#14、#22",
      "codes": [
        "3MA1",
        "4MA1"
      ]
    },
    "safety": "熱水會燙傷，真實實驗必須由老師處理；熱水和冰水的溫差太大可能令膠樽變形或破裂，不要用太熱的水。",
    "modelNote": "氣球的大小為方便觀察而放大了；顯示屏上的毫升數才是按空氣定律算出的實際變化。本模型假設膠樽完全密封而且不會變形。",
    "prediction": {
      "prompt": "根據剛才的觀察，你認為空氣遇熱時會怎樣？",
      "options": [
        "膨脹",
        "收縮",
        "沒有變化"
      ],
      "answer": 0
    },
    "steps": [
      {
        "verb": "套上",
        "title": "把氣球套上樽口",
        "instruction": "把氣球拖到膠樽的樽口上。",
        "cue": "拖動紅色氣球到樽口",
        "hint": "套緊樽口，樽內的空氣才不會走出來。",
        "action": {
          "type": "place",
          "subject": "balloon",
          "target": "bottle-mouth"
        },
        "observation": "氣球套住樽口，樽內的空氣被封住了。"
      },
      {
        "verb": "浸入",
        "title": "把膠樽放進熱水",
        "instruction": "把膠樽垂直拖進熱水盆。",
        "cue": "拖動膠樽到熱水盆",
        "hint": "留意氣球，不要留意膠樽。",
        "action": {
          "type": "place",
          "subject": "bottle",
          "target": "hot-bath"
        },
        "observation": "樽內空氣受熱，氣球慢慢脹起來。"
      },
      {
        "verb": "調校",
        "title": "把熱水調到 75 °C",
        "instruction": "轉動溫度掣，把熱水調到 75 °C。",
        "cue": "拖動紅色溫度掣或使用滑桿",
        "hint": "水愈熱，氣球有甚麼分別？",
        "action": {
          "type": "adjust",
          "subject": "water-temperature",
          "min": 72,
          "max": 78,
          "unit": "°C",
          "range": [
            30,
            85
          ],
          "start": 60
        },
        "observation": "水溫愈高，氣球脹得愈大。"
      },
      {
        "verb": "記錄",
        "title": "記下熱水中的變化",
        "instruction": "氣球在熱水中怎樣了？記進數據表。",
        "cue": "選出氣球的變化",
        "hint": "看顯示屏的毫升數是正還是負。",
        "action": {
          "type": "record",
          "subject": "hot-result",
          "label": "熱水中的氣球",
          "unit": "",
          "options": [
            "脹大",
            "縮小",
            "沒有變化"
          ],
          "answer": 0
        },
        "observation": "熱水的結果已記入數據表。"
      },
      {
        "verb": "浸入",
        "title": "改放進冰水",
        "instruction": "把同一個膠樽拖進冰水盆。",
        "cue": "拖動膠樽到冰水盆",
        "hint": "氣球和膠樽都沒有換過，只換了水。",
        "action": {
          "type": "place",
          "subject": "bottle",
          "target": "ice-bath"
        },
        "observation": "樽內空氣遇冷，氣球癟下去，甚至被吸進樽口。"
      },
      {
        "verb": "記錄",
        "title": "記下冰水中的變化",
        "instruction": "氣球在冰水中怎樣了？記進數據表。",
        "cue": "選出氣球的變化",
        "hint": "顯示屏的毫升數變成負數了。",
        "action": {
          "type": "record",
          "subject": "cold-result",
          "label": "冰水中的氣球",
          "unit": "",
          "options": [
            "脹大",
            "縮小",
            "沒有變化"
          ],
          "answer": 1
        },
        "observation": "冰水的結果已記入數據表，可以比較了。"
      }
    ],
    "analysis": {
      "evidence": "同一個膠樽、同一個氣球，只換了水：在 75 °C 熱水中氣球脹大（約 +90 mL），在 2 °C 冰水中氣球癟下並被吸進樽口（約 −34 mL）。膠樽是硬的，全程形狀不變。",
      "reflection": {
        "prompt": "樽口被氣球封住，沒有空氣進出。那氣球脹大時，多出來的體積是哪裏來的？",
        "options": [
          "熱水的水蒸氣走進了樽內",
          "樽內原有的空氣受熱後佔更多空間",
          "氣球自己產生了空氣"
        ],
        "answer": 1,
        "because": "空氣的分量由頭到尾沒有改變。受熱時空氣粒子運動得更快、分得更開，同樣分量的空氣佔更多空間，多出的體積把氣球撐起；遇冷時粒子運動慢下來、靠得更近，佔的空間變小，氣球就被吸回樽內。"
      }
    },
    "result": {
      "title": "你看見了看不見的空氣！",
      "observation": "空氣受熱時氣球脹大，遇冷時氣球縮小並被吸進樽口；水溫愈高，氣球脹得愈大。",
      "explanation": "空氣受熱會膨脹，遇冷會收縮。分量不變，改變的是同樣分量的空氣所佔的空間：溫度升高，粒子運動加快、間距變大，體積就變大；溫度降低則相反。氣球本身不會製造空氣，它只是把看不見的體積變化顯示出來。"
    }
  },
  "en-US": {
    "id": "air-expansion",
    "number": 7,
    "topic": "Matter",
    "grades": "P3–P5",
    "minutes": 11,
    "title": "Warm Air, Cold Air",
    "englishTitle": "Warm Air, Cold Air",
    "color": "#5ec8b0",
    "icon": "balloon",
    "observe": {
      "title": "A dented table tennis ball becomes round again",
      "notice": [
        "While playing table tennis, Ming accidentally dents a ball. It has no crack or hole.",
        "A teacher places the ball in hot water. After a while, the dent gradually pushes out.",
        "No one adds more air to the ball, yet it returns to its original shape."
      ],
      "wonder": "Why can the dented ball return to its original shape when heated, without anyone adding more air?",
      "image": {
        "key": "ping-pong-recovery",
        "alt": "Illustration: an unbroken, dented table tennis ball is placed in hot water and becomes round again.",
        "captions": [
          "Dented ball",
          "Placed in hot water",
          "Round again"
        ]
      }
    },
    "question": "What happens to the volume of air when it is warmed and when it is cooled?",
    "objective": "Use a balloon as an indicator to watch sealed air expand when warmed and contract when cooled.",
    "apparatus": [
      "Balloon",
      "Rigid empty bottle",
      "Basin of hot water",
      "Basin of iced water",
      "Water temperature dial"
    ],
    "curriculum": {
      "items": "#14, #22",
      "codes": [
        "3MA1",
        "4MA1"
      ]
    },
    "safety": "Hot water scalds, so a teacher must handle it in a real experiment. Too big a jump between hot and iced water can distort or crack the bottle, so do not use water that is too hot.",
    "modelNote": "The balloon is drawn larger than life so the change is easy to see. The millilitres on the display are the real change worked out from the gas laws. This model assumes the bottle is perfectly sealed and does not change shape.",
    "prediction": {
      "prompt": "Based on this observation, what do you think happens to air when it is heated?",
      "options": [
        "It expands",
        "It contracts",
        "No change"
      ],
      "answer": 0
    },
    "steps": [
      {
        "verb": "Fit",
        "title": "Stretch the balloon over the neck",
        "instruction": "Drag the balloon onto the neck of the bottle.",
        "cue": "Drag the red balloon to the neck",
        "hint": "It has to be a tight fit, so the air inside cannot escape.",
        "action": {
          "type": "place",
          "subject": "balloon",
          "target": "bottle-mouth"
        },
        "observation": "The balloon seals the neck and the air inside the bottle is trapped."
      },
      {
        "verb": "Immerse",
        "title": "Stand the bottle in hot water",
        "instruction": "Drag the bottle upright into the basin of hot water.",
        "cue": "Drag the bottle to the hot basin",
        "hint": "Watch the balloon, not the bottle.",
        "action": {
          "type": "place",
          "subject": "bottle",
          "target": "hot-bath"
        },
        "observation": "The air inside warms and the balloon slowly swells."
      },
      {
        "verb": "Adjust",
        "title": "Set the water to 75 °C",
        "instruction": "Turn the dial until the hot water reads 75 °C.",
        "cue": "Drag the red dial, or use the slider",
        "hint": "The hotter the water, the more the balloon does what?",
        "action": {
          "type": "adjust",
          "subject": "water-temperature",
          "min": 72,
          "max": 78,
          "unit": "°C",
          "range": [
            30,
            85
          ],
          "start": 60
        },
        "observation": "The hotter the water, the bigger the balloon grows."
      },
      {
        "verb": "Record",
        "title": "Record what happened in the hot water",
        "instruction": "What did the balloon do in the hot water? Record it.",
        "cue": "Choose what the balloon did",
        "hint": "Is the millilitre figure on the display positive or negative?",
        "action": {
          "type": "record",
          "subject": "hot-result",
          "label": "The balloon in hot water",
          "unit": "",
          "options": [
            "Swelled",
            "Shrank",
            "No change"
          ],
          "answer": 0
        },
        "observation": "The hot-water result is in your data table."
      },
      {
        "verb": "Immerse",
        "title": "Move it to the iced water",
        "instruction": "Drag the same bottle into the basin of iced water.",
        "cue": "Drag the bottle to the iced basin",
        "hint": "Same balloon, same bottle — only the water changed.",
        "action": {
          "type": "place",
          "subject": "bottle",
          "target": "ice-bath"
        },
        "observation": "The air inside cools, the balloon sags, and it is even drawn down into the neck."
      },
      {
        "verb": "Record",
        "title": "Record what happened in the iced water",
        "instruction": "What did the balloon do in the iced water? Record it.",
        "cue": "Choose what the balloon did",
        "hint": "The millilitre figure on the display has gone negative.",
        "action": {
          "type": "record",
          "subject": "cold-result",
          "label": "The balloon in iced water",
          "unit": "",
          "options": [
            "Swelled",
            "Shrank",
            "No change"
          ],
          "answer": 1
        },
        "observation": "The iced-water result is in your data table, ready to compare."
      }
    ],
    "analysis": {
      "evidence": "Same bottle, same balloon, only the water changed: in 75 °C water the balloon swelled by about +90 mL, and in 2 °C iced water it sagged and was drawn into the neck, about −34 mL. The bottle is rigid and never changed shape.",
      "reflection": {
        "prompt": "The balloon seals the neck, so no air goes in or out. Where does the extra volume come from when it swells?",
        "options": [
          "Steam from the hot water gets into the bottle",
          "The air already inside takes up more room when it is warmed",
          "The balloon makes its own air"
        ],
        "answer": 1,
        "because": "The amount of air never changes. Warmed, its particles move faster and spread further apart, so the same amount of air takes up more room and pushes the balloon out. Cooled, they slow down and move closer together, take up less room, and the balloon is drawn back into the bottle."
      }
    },
    "result": {
      "title": "You saw air you cannot see!",
      "observation": "Warmed, the air swelled the balloon; cooled, the balloon shrank and was drawn into the neck. The hotter the water, the bigger the balloon grew.",
      "explanation": "Air expands when warmed and contracts when cooled. The amount does not change — what changes is how much room that same amount takes up. Warmer means faster particles, further apart, and more volume; colder means the opposite. The balloon makes no air of its own; it simply shows a change in volume you could not otherwise see."
    }
  }
};
export const experiments = [];
export const experimentById = new Map();
export function selectExperimentLanguage(language) {
 const definition = structuredClone(editions[language] || editions['zh-HK']);
 experiments.splice(0, experiments.length, definition);
 experimentById.clear(); experimentById.set(definition.id, definition);
}
selectExperimentLanguage(globalThis.BuiI18n?.lang);
export function getNextExperiment() { return null; }
