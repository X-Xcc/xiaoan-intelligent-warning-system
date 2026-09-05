from pathlib import Path

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_AUTO_SHAPE_TYPE
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.util import Inches, Pt


SRC = Path(r"D:\xx\Desktop\烟火PPT.pptx")
OUT = Path(r"D:\xx\Desktop\烟火PPT-技术与成长优化版.pptx")
ANALYSIS = Path(r"D:\CICSIC\ppt_analysis")
SLIDES = ANALYSIS / "slides_png"
CERTS = ANALYSIS / "selected_certs"
STYLE = ANALYSIS / "style_assets"

FONT = "Microsoft YaHei"
WHITE = RGBColor(245, 250, 255)
MUTED = RGBColor(196, 220, 238)
CYAN = RGBColor(56, 205, 255)
GOLD = RGBColor(255, 211, 94)
RED = RGBColor(255, 94, 92)
NAVY = RGBColor(8, 24, 46)
CARD = RGBColor(17, 52, 89)
CARD2 = RGBColor(10, 38, 70)
LINE = RGBColor(72, 184, 232)


def clear_text_shapes(slide):
    for shape in list(slide.shapes):
        if hasattr(shape, "text") and shape.text.strip():
            shape.element.getparent().remove(shape.element)


def add_box(slide, x, y, w, h, fill=CARD, line=LINE, transparency=12, radius=False):
    shp = slide.shapes.add_shape(
        MSO_AUTO_SHAPE_TYPE.ROUNDED_RECTANGLE if radius else MSO_AUTO_SHAPE_TYPE.RECTANGLE,
        Inches(x),
        Inches(y),
        Inches(w),
        Inches(h),
    )
    shp.fill.solid()
    shp.fill.fore_color.rgb = fill
    try:
        shp.fill.transparency = transparency / 100
    except Exception:
        pass
    shp.line.color.rgb = line
    shp.line.width = Pt(1)
    try:
        shp.shadow.inherit = False
    except Exception:
        pass
    return shp


def add_text(slide, text, x, y, w, h, size=18, color=WHITE, bold=False, align="left", valign="top"):
    box = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = box.text_frame
    tf.clear()
    tf.margin_left = Inches(0.05)
    tf.margin_right = Inches(0.05)
    tf.margin_top = Inches(0.02)
    tf.margin_bottom = Inches(0.02)
    tf.vertical_anchor = {"top": MSO_ANCHOR.TOP, "mid": MSO_ANCHOR.MIDDLE, "bottom": MSO_ANCHOR.BOTTOM}[valign]
    p = tf.paragraphs[0]
    p.alignment = {"left": PP_ALIGN.LEFT, "center": PP_ALIGN.CENTER, "right": PP_ALIGN.RIGHT}[align]
    run = p.add_run()
    run.text = text
    run.font.name = FONT
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.color.rgb = color
    return box


def add_title(slide, title, subtitle=None):
    label = title
    rest = ""
    for sep in ["：", ":"]:
        if sep in title:
            label, rest = title.split(sep, 1)
            break
    add_box(slide, 0.56, 0.38, 4.3, 0.72, fill=RGBColor(16, 64, 116), line=RGBColor(82, 151, 231), transparency=22, radius=False)
    add_text(slide, f"《 {label.strip()} 》", 0.78, 0.48, 3.86, 0.35, size=25, color=WHITE, bold=True, align="center", valign="mid")
    mark = STYLE / "college_mark.png"
    if mark.exists():
        add_image_fit(slide, mark, 8.55, 0.16, 3.95, 0.55)
    sub = rest.strip()
    if subtitle:
        sub = f"{sub} | {subtitle}" if sub else subtitle
    if sub:
        add_text(slide, sub, 0.72, 1.1, 8.85, 0.24, size=11.5, color=MUTED)


def add_bullets(slide, items, x, y, w, h, size=13, color=WHITE, bullet_color=GOLD):
    top = y
    for head, body in items:
        add_text(slide, "◆", x, top + 0.02, 0.25, 0.18, size=size, color=bullet_color, bold=True)
        add_text(slide, head, x + 0.28, top, w - 0.28, 0.22, size=size + 1, color=WHITE, bold=True)
        add_text(slide, body, x + 0.28, top + 0.28, w - 0.28, 0.42, size=size - 1, color=MUTED)
        top += 0.82


def add_tag(slide, text, x, y, w=1.2, color=GOLD):
    shp = add_box(slide, x, y, w, 0.34, fill=RGBColor(10, 41, 76), line=color, transparency=3, radius=True)
    add_text(slide, text, x + 0.06, y + 0.065, w - 0.12, 0.18, size=10.5, color=color, bold=True, align="center")
    return shp


def add_bottom_claim(slide, text):
    add_box(slide, 1.25, 6.68, 10.8, 0.42, fill=RGBColor(4, 34, 65), line=GOLD, transparency=5, radius=True)
    add_text(slide, text, 1.42, 6.77, 10.45, 0.16, size=14, color=GOLD, bold=True, align="center")


def add_flow(slide, steps, x, y, w, gap=0.15):
    n = len(steps)
    bw = (w - gap * (n - 1)) / n
    for i, (title, sub) in enumerate(steps):
        bx = x + i * (bw + gap)
        add_box(slide, bx, y, bw, 0.82, fill=CARD2, line=CYAN, transparency=8, radius=True)
        add_text(slide, title, bx + 0.08, y + 0.12, bw - 0.16, 0.18, size=12, color=GOLD, bold=True, align="center")
        add_text(slide, sub, bx + 0.08, y + 0.42, bw - 0.16, 0.24, size=9.5, color=MUTED, align="center")
        if i < n - 1:
            add_text(slide, "→", bx + bw - 0.02, y + 0.25, gap + 0.05, 0.2, size=17, color=CYAN, bold=True, align="center")


def add_image_fit(slide, path, x, y, w, h):
    # Let PowerPoint crop minimally by fitting within the bounding box.
    pic = slide.shapes.add_picture(str(path), Inches(x), Inches(y), width=Inches(w))
    if pic.height > Inches(h):
        ratio = Inches(h) / pic.height
        pic.width = int(pic.width * ratio)
        pic.height = Inches(h)
    pic.left = Inches(x) + int((Inches(w) - pic.width) / 2)
    pic.top = Inches(y) + int((Inches(h) - pic.height) / 2)
    return pic


def add_image_panel(slide, path, x, y, w, h, title=None):
    add_box(slide, x - 0.06, y - 0.06, w + 0.12, h + 0.12, fill=RGBColor(8, 31, 58), line=CYAN, transparency=8, radius=False)
    pic = add_image_fit(slide, path, x, y, w, h)
    if title:
        add_text(slide, title, x + 0.08, y + h + 0.1, w - 0.16, 0.18, size=10.5, color=CYAN, bold=True, align="center")
    return pic


def add_big_phrase(slide, prefix, keyword, x, y, w=4.5):
    add_text(slide, prefix, x, y, w, 0.26, size=18, color=WHITE, bold=True)
    add_text(slide, keyword, x + 1.35, y - 0.1, w - 1.1, 0.48, size=28, color=GOLD, bold=True)


def slide13(slide):
    clear_text_shapes(slide)
    add_title(slide, "核心技术一：多源感知", "摄像头、无人机、机器狗、人工上报共同形成夜市风险感知网络")
    add_big_phrase(slide, "固定视频:", "重点点位", 0.92, 1.72, 4.2)
    add_big_phrase(slide, "无人机:", "高空补盲", 0.92, 2.58, 4.2)
    add_big_phrase(slide, "机器狗:", "地面核查", 0.92, 3.44, 4.2)
    add_big_phrase(slide, "一键上报:", "线索入池", 0.92, 4.3, 4.2)
    add_box(slide, 0.9, 5.12, 4.4, 0.7, fill=RGBColor(8, 34, 62), line=LINE, transparency=10, radius=True)
    add_text(slide, "从“看见画面”升级为“识别事件”", 1.12, 5.36, 3.9, 0.18, size=13.5, color=CYAN, bold=True, align="center")
    add_image_panel(slide, STYLE / "map_product_screenshot.png", 5.82, 1.58, 5.55, 3.72, "风险情况图 / 多源点位聚合")
    add_flow(
        slide,
        [
            ("采集", "图像/位置/时间"),
            ("清洗", "重复线索合并"),
            ("识别", "聚集/争执/拥堵"),
            ("入池", "事件卡片"),
        ],
        5.78,
        5.62,
        5.65,
    )
    add_bottom_claim(slide, "让风险看得见：零散视频、设备巡检和人工线索汇聚为可分析事件流")


def slide14(slide):
    clear_text_shapes(slide)
    add_title(slide, "核心技术二：辅助分析", "辅助分析、人工复核、轻量部署、合规留痕")
    add_text(slide, "多源融合方法", 1.15, 1.62, 3.1, 0.36, size=24, color=GOLD, bold=True)
    add_text(slide, "视频识别 + 规则评分 + 人工复核", 1.05, 2.16, 4.5, 0.28, size=17, color=WHITE, bold=True)
    add_text(slide, "秒级分析边界", 1.05, 2.7, 2.3, 0.34, size=23, color=GOLD, bold=True)
    add_text(slide, "系统只做辅助，不替代执法", 2.9, 2.72, 2.5, 0.26, size=17, color=WHITE, bold=True)
    add_image_panel(slide, STYLE / "confidence_curve_screenshot.png", 0.98, 3.35, 4.15, 2.25, "识别方法验证曲线")
    add_image_panel(slide, STYLE / "model_chart_screenshot.png", 6.05, 1.58, 5.65, 2.55, "多源融合方法结构")
    add_box(slide, 6.1, 4.55, 5.55, 1.0, fill=RGBColor(7, 35, 66), line=GOLD, transparency=10, radius=True)
    add_text(slide, "输出：风险分级 / 处置建议 / 审计留痕", 6.36, 4.82, 5.0, 0.28, size=20, color=GOLD, bold=True, align="center")
    add_bottom_claim(slide, "让线索聚得准：辅助分析更早发现、更快归并、更准推荐")


def slide15(slide):
    clear_text_shapes(slide)
    add_title(slide, "核心技术三：一键报警", "从报警到派单、现场反馈、证据复盘，全流程可流转")
    add_text(slide, "一键报警", 0.95, 1.72, 2.1, 0.36, size=24, color=GOLD, bold=True)
    add_text(slide, "触发事件流", 2.8, 1.74, 2.2, 0.3, size=19, color=WHITE, bold=True)
    add_text(slide, "Web指挥端", 0.95, 2.48, 2.5, 0.36, size=24, color=GOLD, bold=True)
    add_text(slide, "统一调度", 3.05, 2.5, 1.7, 0.3, size=19, color=WHITE, bold=True)
    add_text(slide, "巡防/设备端", 0.95, 3.24, 2.7, 0.36, size=24, color=GOLD, bold=True)
    add_text(slide, "结果回传", 3.35, 3.26, 1.7, 0.3, size=19, color=WHITE, bold=True)
    add_image_panel(slide, STYLE / "web_command_screenshot.png", 5.65, 1.52, 5.45, 3.98, "指挥端原型运行截图")
    add_flow(
        slide,
        [
            ("报警", "商户提交"),
            ("定位", "入事件池"),
            ("分析", "分级去重"),
            ("派单", "巡防/无人机"),
            ("复盘", "证据留痕"),
        ],
        0.95,
        5.55,
        10.45,
        gap=0.1,
    )
    add_bottom_claim(slide, "让力量调得动、过程留得住：一键报警不是按钮，而是触发完整处置流程")


def slide16(slide):
    clear_text_shapes(slide)
    add_title(slide, "技术壁垒：场景化治理流程，不止单点识别", "主放三项贴合软著，证明自动巡检、数据运维、集群调度能力")
    certs = [
        ("03_自动巡检集成_thumb.png", "自动巡检集成", "空中巡防与异常发现"),
        ("02_大数据集成运维_thumb.png", "大数据集成运维", "多源数据汇聚与运维"),
        ("01_集群调度管理_thumb.png", "集群调度管理", "多机协同与任务调度"),
    ]
    for i, (img, title, sub) in enumerate(certs):
        x = 0.76 + i * 3.0
        add_box(slide, x, 1.38, 2.55, 3.56, fill=RGBColor(9, 34, 62), line=CYAN, transparency=8, radius=True)
        add_image_fit(slide, CERTS / img, x + 0.18, 1.55, 2.18, 2.75)
        add_text(slide, title, x + 0.22, 4.45, 2.1, 0.2, size=12.5, color=GOLD, bold=True, align="center")
        add_text(slide, sub, x + 0.22, 4.73, 2.1, 0.18, size=9.5, color=MUTED, align="center")
    add_box(slide, 9.98, 1.38, 2.65, 3.56, fill=RGBColor(10, 37, 70), line=GOLD, transparency=5, radius=True)
    add_text(slide, "为什么只放这三项？", 10.2, 1.65, 2.1, 0.25, size=15, color=GOLD, bold=True)
    add_bullets(
        slide,
        [
            ("贴合场景", "直接对应夜市空中巡检与高峰盲区补位"),
            ("贴合平台", "支撑多源数据、事件流和运维留痕"),
            ("贴合处置", "支撑报警后的设备调度与协同响应"),
        ],
        10.18,
        2.12,
        2.12,
        2.3,
        size=10.5,
    )
    add_box(slide, 1.1, 5.42, 11.05, 0.72, fill=RGBColor(5, 33, 61), line=LINE, transparency=10, radius=True)
    add_text(slide, "弱化处理：雷达定位测试仅作为底层可靠性支撑；证书主体不一致的材料不进入技术壁垒页。", 1.38, 5.65, 10.4, 0.18, size=12, color=MUTED, align="center")
    add_bottom_claim(slide, "壁垒来自“自动巡检 + 数据运维 + 集群调度 + 警务流程适配”的组合能力")


def slide17(slide):
    clear_text_shapes(slide)
    add_title(slide, "专家认可：围绕真实场景验证技术路线", "专家材料待签署，当前页保留正式背书位，不虚构姓名与结论")
    roles = [
        ("警务治理专家", "认可重点：夜市商圈突发警情处置流程、证据留痕和复盘价值"),
        ("无人机/自动装备专家", "认可重点：低空巡检、设备协同和多源感知可行性"),
        ("创新创业/产业专家", "认可重点：样板试点、安保企业合作和区域复制路径"),
    ]
    for i, (role, desc) in enumerate(roles):
        x = 0.8 + i * 4.0
        add_box(slide, x, 1.42, 3.48, 4.2, fill=CARD, line=CYAN, transparency=8, radius=True)
        add_box(slide, x + 1.17, 1.76, 1.1, 1.1, fill=RGBColor(12, 56, 94), line=GOLD, transparency=5, radius=True)
        add_text(slide, "照片/签字", x + 1.33, 2.18, 0.8, 0.16, size=10, color=MUTED, align="center")
        add_text(slide, role, x + 0.3, 3.08, 2.88, 0.25, size=16, color=GOLD, bold=True, align="center")
        add_text(slide, desc, x + 0.35, 3.55, 2.78, 0.66, size=11.5, color=WHITE)
        add_box(slide, x + 0.35, 4.55, 2.78, 0.55, fill=RGBColor(6, 32, 62), line=GOLD, transparency=10, radius=True)
        add_text(slide, "待补：专家姓名/单位/职务/评语", x + 0.5, 4.78, 2.48, 0.14, size=9.5, color=MUTED, align="center")
    add_bottom_claim(slide, "专家背书只写可核验材料：需求真、路线稳、场景能落地")


def slide18(slide):
    clear_text_shapes(slide)
    add_title(slide, "第三方检测：以指标验证工程化可用性", "检测待定，先建立指标体系；拿到报告后替换为正式检测结果")
    add_box(slide, 0.82, 1.35, 5.2, 4.55, fill=CARD, line=CYAN, transparency=8, radius=True)
    add_text(slide, "建议检测项目", 1.12, 1.63, 1.8, 0.28, size=18, color=GOLD, bold=True)
    add_bullets(
        slide,
        [
            ("功能完整性", "一键报警、事件派单、接单反馈、流程报告"),
            ("响应时延", "报警入池、指挥端弹窗、任务推送的时间"),
            ("系统稳定性", "多端登录、连续运行、异常恢复能力"),
            ("留痕完整性", "日志、图片、视频、处置记录、复盘报告"),
            ("联动成功率", "指挥端、商户端、巡防端任务流转成功率"),
        ],
        1.08,
        2.08,
        4.28,
        3.4,
        size=11,
    )
    add_box(slide, 6.35, 1.35, 5.98, 4.55, fill=RGBColor(8, 34, 62), line=GOLD, transparency=8, radius=True)
    add_text(slide, "指标口径必须分清", 6.7, 1.63, 2.1, 0.28, size=18, color=WHITE, bold=True)
    rows = [
        ("演示数据", "用于省赛现场演示，不作为正式检测结论"),
        ("目标数据", "作为试点前的设计目标和验收口径"),
        ("实测数据", "由第三方或试点单位测试后填入"),
    ]
    for i, (name, desc) in enumerate(rows):
        y = 2.22 + i * 1.0
        add_tag(slide, name, 6.78, y, 1.35, color=[CYAN, GOLD, RED][i])
        add_text(slide, desc, 8.35, y + 0.06, 3.3, 0.2, size=12, color=MUTED)
    add_box(slide, 6.92, 5.08, 4.55, 0.42, fill=RGBColor(5, 33, 61), line=LINE, transparency=10, radius=True)
    add_text(slide, "待补：检测机构名称 / 报告编号 / 盖章页", 7.2, 5.23, 4.0, 0.13, size=10.5, color=GOLD, align="center")
    add_bottom_claim(slide, "不提前宣称“已通过”，用可检测指标建立可信边界")


def growth_slide(slide, title, subtitle, cards, claim):
    clear_text_shapes(slide)
    add_title(slide, title, subtitle)
    for i, (head, body) in enumerate(cards):
        x = 0.8 + (i % 2) * 5.9
        y = 1.45 + (i // 2) * 2.13
        add_box(slide, x, y, 5.22, 1.62, fill=CARD, line=CYAN if i % 2 == 0 else GOLD, transparency=8, radius=True)
        add_text(slide, f"0{i+1}", x + 0.25, y + 0.24, 0.55, 0.24, size=16, color=GOLD, bold=True)
        add_text(slide, head, x + 0.9, y + 0.23, 3.8, 0.24, size=15, color=WHITE, bold=True)
        add_text(slide, body, x + 0.9, y + 0.68, 3.9, 0.46, size=11.2, color=MUTED)
    add_bottom_claim(slide, claim)


def slide24(slide):
    growth_slide(
        slide,
        "项目负责人成长：从技术执行到系统统筹",
        "把技术语言转化为治理价值，把单点功能组织成完整项目",
        [
            ("需求理解", "从夜市、商圈、巡防、商户联防中提炼真实痛点"),
            ("技术统筹", "组织大屏、小程序、事件流、设备接入与演示流程"),
            ("团队协同", "推动技术、调研、商业、路演材料分工协作"),
            ("路演表达", "将“技术 + 警务 + 低空巡检”讲成评委能理解的价值"),
        ],
        "个人成长不是履历堆叠，而是从会做功能到能统筹项目",
    )


def slide25(slide):
    growth_slide(
        slide,
        "团队协作成长：跨专业分工支撑治理流程",
        "警察、信息安全、司法、法律、无人机与数据专业能力共同进入项目",
        [
            ("技术开发组", "负责原型搭建、前后端联动、事件流与演示稳定性"),
            ("场景调研组", "访谈商户、消费者、安保人员、基层治理人员"),
            ("材料路演组", "将技术、市场、财务与社会价值整理成省赛表达"),
            ("合规支撑组", "关注人工复核、证据留痕、数据边界和处置复盘"),
        ],
        "团队优势不是专业名称多，而是刚好对应夜市治理链条",
    )


def slide26(slide):
    clear_text_shapes(slide)
    add_title(slide, "团队项目成长：从创意方案到可演示原型", "按照“调研-开发-验证-复制”的节奏推进")
    stages = [
        ("阶段一", "痛点调研", "梳理夜市突发警情、商户上报、巡防流程需求"),
        ("阶段二", "原型开发", "完成大屏、小程序、后端事件流和流程演示"),
        ("阶段三", "指导优化", "根据老师和专家意见优化技术证据链"),
        ("阶段四", "试点复制", "争取实训基地、安保企业、夜市运营方合作"),
    ]
    for i, (stage, head, body) in enumerate(stages):
        x = 0.85 + i * 3.05
        add_box(slide, x, 2.0, 2.55, 2.72, fill=CARD, line=GOLD if i == 3 else CYAN, transparency=8, radius=True)
        add_text(slide, stage, x + 0.25, 2.28, 1.0, 0.24, size=13, color=GOLD, bold=True)
        add_text(slide, head, x + 0.25, 2.75, 1.5, 0.28, size=18, color=WHITE, bold=True)
        add_text(slide, body, x + 0.25, 3.35, 1.95, 0.68, size=11, color=MUTED)
        if i < 3:
            add_text(slide, "→", x + 2.55, 3.08, 0.5, 0.25, size=22, color=CYAN, bold=True, align="center")
    add_bottom_claim(slide, "省赛展示重点：不要只讲设想，要展示可点击、可流转、可复盘")


def slide27(slide):
    growth_slide(
        slide,
        "学校资源成长：把专业平台转化为项目能力",
        "依托学院警务、无人机、信息安全和创新创业资源形成项目支撑",
        [
            ("指导老师资源", "持续打磨需求真实性、警务流程和路演表达"),
            ("实训平台资源", "支撑无人机巡检、应急处置、场景演练和原型验证"),
            ("专业课程资源", "信息系统开发、数据分析、司法实务与合规认知"),
            ("竞赛训练资源", "通过省赛集训完成商业计划、PPT和答辩流程"),
        ],
        "学校资源不是背景介绍，而是项目能从创意走向原型的支撑条件",
    )


def slide28(slide):
    growth_slide(
        slide,
        "产教融合成长：在真实场景中提升职业能力",
        "把职业技能训练、警务场景需求和企业化产品思维连接起来",
        [
            ("场景融通", "面向夜市、商圈、安保、基层治理等真实开放空间"),
            ("技能融通", "融合无人机应用、系统开发、数据分析和应急处置"),
            ("资源融通", "争取学校实训基地、安保企业、运营方和专家指导"),
            ("成果融通", "形成可演示原型、可复制方案和可沉淀课程资源"),
        ],
        "产教融合的价值：让比赛成果进入真实治理场景，而不是停在作品展示",
    )


def main():
    prs = Presentation(SRC)
    actions = {
        13: slide13,
        14: slide14,
        15: slide15,
        16: slide16,
        17: slide17,
        18: slide18,
        24: slide24,
        25: slide25,
        26: slide26,
        27: slide27,
        28: slide28,
    }
    for number, func in actions.items():
        func(prs.slides[number - 1])
    prs.save(OUT)
    print(OUT)


if __name__ == "__main__":
    main()


