from pathlib import Path
from docx import Document
from docx.shared import Pt, Inches, RGBColor, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
from docx.enum.section import WD_SECTION_START
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.oxml.shared import OxmlElement as SharedOxmlElement


BASE = Path(r"D:\CICSIC")
OUT = BASE / "outputs" / "夜市慧盾商业计划书_20260903"
DOCX_PATH = OUT / "夜市慧盾公共安全智能预警与秒级响应系统商业计划书.docx"


def set_cell_shading(cell, fill):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:fill"), fill)
    tc_pr.append(shd)


def set_cell_margins(cell, top=90, start=120, bottom=90, end=120):
    tc = cell._tc
    tc_pr = tc.get_or_add_tcPr()
    tc_mar = tc_pr.first_child_found_in("w:tcMar")
    if tc_mar is None:
        tc_mar = OxmlElement("w:tcMar")
        tc_pr.append(tc_mar)
    for attr, val in [("top", top), ("start", start), ("bottom", bottom), ("end", end)]:
        node = tc_mar.find(qn(f"w:{attr}"))
        if node is None:
            node = OxmlElement(f"w:{attr}")
            tc_mar.append(node)
        node.set(qn("w:w"), str(val))
        node.set(qn("w:type"), "dxa")


def set_repeat_table_header(row):
    tr_pr = row._tr.get_or_add_trPr()
    tbl_header = OxmlElement("w:tblHeader")
    tbl_header.set(qn("w:val"), "true")
    tr_pr.append(tbl_header)


def set_table_fixed_width(table, widths):
    table.alignment = WD_TABLE_ALIGNMENT.LEFT
    tbl = table._tbl
    tblPr = tbl.tblPr
    tblW = tblPr.first_child_found_in("w:tblW")
    if tblW is None:
        tblW = OxmlElement("w:tblW")
        tblPr.append(tblW)
    tblW.set(qn("w:w"), str(sum(widths)))
    tblW.set(qn("w:type"), "dxa")
    tblInd = tblPr.first_child_found_in("w:tblInd")
    if tblInd is None:
        tblInd = OxmlElement("w:tblInd")
        tblPr.append(tblInd)
    tblInd.set(qn("w:w"), "120")
    tblInd.set(qn("w:type"), "dxa")
    tblGrid = tbl.tblGrid
    for g in list(tblGrid):
        tblGrid.remove(g)
    for w in widths:
        col = OxmlElement("w:gridCol")
        col.set(qn("w:w"), str(w))
        tblGrid.append(col)
    for row in table.rows:
        for i, cell in enumerate(row.cells):
            tc = cell._tc
            tcPr = tc.get_or_add_tcPr()
            tcW = tcPr.first_child_found_in("w:tcW")
            if tcW is None:
                tcW = OxmlElement("w:tcW")
                tcPr.append(tcW)
            tcW.set(qn("w:w"), str(widths[i]))
            tcW.set(qn("w:type"), "dxa")
            set_cell_margins(cell)
            cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER


def set_paragraph_format(par, before=0, after=0, line=1.25, left=0, right=0):
    pf = par.paragraph_format
    pf.space_before = Pt(before)
    pf.space_after = Pt(after)
    pf.left_indent = Inches(left)
    pf.right_indent = Inches(right)
    pf.line_spacing = line


def style_run(run, size=11, bold=False, color="1F1F1F", font="Microsoft YaHei"):
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.color.rgb = RGBColor.from_string(color)
    run.font.name = font
    run._element.rPr.rFonts.set(qn("w:eastAsia"), font)


def add_page_number(par):
    fld = OxmlElement("w:fldSimple")
    fld.set(qn("w:instr"), "PAGE")
    r = OxmlElement("w:r")
    rPr = OxmlElement("w:rPr")
    sz = OxmlElement("w:sz")
    sz.set(qn("w:val"), "18")
    color = OxmlElement("w:color")
    color.set(qn("w:val"), "7A7A7A")
    rPr.append(sz)
    rPr.append(color)
    r.append(rPr)
    t = OxmlElement("w:t")
    t.text = "1"
    r.append(t)
    fld.append(r)
    par._p.append(fld)


def add_footer(section):
    footer = section.footer
    p = footer.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    p.clear()
    r = p.add_run("第 ")
    style_run(r, size=9, color="7A7A7A")
    add_page_number(p)
    r2 = p.add_run(" 页")
    style_run(r2, size=9, color="7A7A7A")


def add_header(section):
    header = section.header
    p = header.paragraphs[0]
    p.clear()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run("夜市慧盾 | 商业计划书")
    style_run(r, size=9, color="7A7A7A")


def add_title_page(doc):
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    set_paragraph_format(p, before=150, after=0, line=1.0)
    r = p.add_run("夜市慧盾")
    style_run(r, size=26, bold=True, color="1F3A5F")
    p2 = doc.add_paragraph()
    p2.alignment = WD_ALIGN_PARAGRAPH.CENTER
    set_paragraph_format(p2, before=0, after=0, line=1.0)
    r = p2.add_run("公共安全智能预警与秒级响应系统")
    style_run(r, size=18, bold=True, color="1F3A5F")
    p3 = doc.add_paragraph()
    p3.alignment = WD_ALIGN_PARAGRAPH.CENTER
    set_paragraph_format(p3, before=6, after=18, line=1.0)
    r = p3.add_run("中国国际大学生创新大赛 · 职教赛道 · 创意组")
    style_run(r, size=12, color="4F6A85")
    meta = [
        ("项目负责人", "徐俊"),
        ("学校", "江西司法警官职业学院"),
        ("版本", "完整商业计划书"),
        ("日期", "2026年9月3日"),
    ]
    table = doc.add_table(rows=2, cols=2)
    table.style = "Table Grid"
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    set_table_fixed_width(table, [4320, 4320])
    cells = [table.cell(0, 0), table.cell(0, 1), table.cell(1, 0), table.cell(1, 1)]
    cells[0].text = "项目负责人"
    cells[1].text = "徐俊"
    cells[2].text = "学校"
    cells[3].text = "江西司法警官职业学院"
    for c in cells:
        c.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
    for c in cells:
        set_cell_margins(c, top=120, start=160, bottom=120, end=160)
    for i, c in enumerate(cells):
        set_cell_shading(c, "EEF3F8" if i % 2 == 0 else "FFFFFF")
        for p in c.paragraphs:
            for r in p.runs:
                style_run(r, size=11, bold=(i % 2 == 0), color="1F1F1F")
    doc.add_paragraph("")
    note = doc.add_paragraph()
    note.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = note.add_run("参考材料：项目PPT、原型界面、证书预览与既有项目资料")
    style_run(r, size=10, color="6B7785")
    doc.add_page_break()


def add_heading(doc, text, level=1):
    p = doc.add_paragraph(style=f"Heading {level}")
    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    r = p.add_run(text)
    style_run(r, size={1: 16, 2: 13, 3: 11}.get(level, 11), bold=True, color={1: "2E74B5", 2: "1F3A5F", 3: "335C7D"}.get(level, "1F1F1F"))
    set_paragraph_format(p, before={1: 12, 2: 8, 3: 6}.get(level, 6), after=6, line=1.15)
    return p


def add_para(doc, text, size=11, bold=False, color="1F1F1F", align=WD_ALIGN_PARAGRAPH.JUSTIFY, before=0, after=6, line=1.35):
    p = doc.add_paragraph()
    p.alignment = align
    set_paragraph_format(p, before=before, after=after, line=line)
    r = p.add_run(text)
    style_run(r, size=size, bold=bold, color=color)
    return p


def add_bullets(doc, items):
    for item in items:
        p = doc.add_paragraph(style="List Bullet")
        set_paragraph_format(p, before=0, after=2, line=1.25)
        r = p.add_run(item)
        style_run(r, size=10.5)


def add_numbered(doc, items):
    for item in items:
        p = doc.add_paragraph(style="List Number")
        set_paragraph_format(p, before=0, after=2, line=1.25)
        r = p.add_run(item)
        style_run(r, size=10.5)


def add_caption(doc, text):
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    set_paragraph_format(p, before=4, after=8, line=1.0)
    r = p.add_run(text)
    style_run(r, size=9.5, color="6B7785")


def set_table_style(table):
    table.style = "Table Grid"
    table.alignment = WD_TABLE_ALIGNMENT.CENTER


def add_two_col_table(doc, rows, widths=(2200, 7160), header_fill="DCE6F2"):
    table = doc.add_table(rows=len(rows), cols=2)
    set_table_style(table)
    set_table_fixed_width(table, list(widths))
    if len(rows) > 1:
        set_repeat_table_header(table.rows[0])
    for i, (a, b) in enumerate(rows):
        c1, c2 = table.rows[i].cells
        c1.text = a
        c2.text = b
        for c in (c1, c2):
            set_cell_margins(c)
            c.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
            for p in c.paragraphs:
                p.alignment = WD_ALIGN_PARAGRAPH.LEFT
                for r in p.runs:
                    style_run(r, size=10)
        set_cell_shading(c1, header_fill if i == 0 else "F8FAFC")
        if i == 0:
            set_cell_shading(c2, header_fill)
            for c in (c1, c2):
                for p in c.paragraphs:
                    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                    for r in p.runs:
                        style_run(r, size=10.5, bold=True)
    return table


def add_three_col_table(doc, rows, widths):
    table = doc.add_table(rows=len(rows), cols=3)
    set_table_style(table)
    set_table_fixed_width(table, widths)
    if len(rows) > 1:
        set_repeat_table_header(table.rows[0])
    for i, row in enumerate(rows):
        for j, value in enumerate(row):
            c = table.cell(i, j)
            c.text = value
            set_cell_margins(c)
            set_cell_shading(c, "EAF1F8" if i == 0 else "FFFFFF")
            for p in c.paragraphs:
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER if i == 0 or j != 2 else WD_ALIGN_PARAGRAPH.LEFT
                for r in p.runs:
                    style_run(r, size=10.0, bold=(i == 0))
    return table


def add_four_col_table(doc, rows, widths):
    table = doc.add_table(rows=len(rows), cols=4)
    set_table_style(table)
    set_table_fixed_width(table, widths)
    if len(rows) > 1:
        set_repeat_table_header(table.rows[0])
    for i, row in enumerate(rows):
        for j, value in enumerate(row):
            c = table.cell(i, j)
            c.text = value
            set_cell_margins(c)
            set_cell_shading(c, "EAF1F8" if i == 0 else "FFFFFF")
            for p in c.paragraphs:
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER if i == 0 else (WD_ALIGN_PARAGRAPH.CENTER if j < 3 else WD_ALIGN_PARAGRAPH.LEFT)
                for r in p.runs:
                    style_run(r, size=9.5, bold=(i == 0))
    return table


def add_image(doc, path, width_inches, caption=None):
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    set_paragraph_format(p, before=6, after=4, line=1.0)
    p.add_run().add_picture(str(path), width=Inches(width_inches))
    if caption:
        add_caption(doc, caption)


def build():
    OUT.mkdir(parents=True, exist_ok=True)
    doc = Document()
    section = doc.sections[0]
    section.page_width = Inches(8.5)
    section.page_height = Inches(11)
    section.top_margin = Inches(1)
    section.bottom_margin = Inches(1)
    section.left_margin = Inches(1)
    section.right_margin = Inches(1)
    section.header_distance = Inches(0.4)
    section.footer_distance = Inches(0.45)

    styles = doc.styles
    normal = styles["Normal"]
    normal.font.name = "Microsoft YaHei"
    normal._element.rPr.rFonts.set(qn("w:eastAsia"), "Microsoft YaHei")
    normal.font.size = Pt(11)
    normal.paragraph_format.space_before = Pt(0)
    normal.paragraph_format.space_after = Pt(6)
    normal.paragraph_format.line_spacing = 1.35

    for name, size, color in [("Heading 1", 16, "2E74B5"), ("Heading 2", 13, "1F3A5F"), ("Heading 3", 11, "335C7D")]:
        st = styles[name]
        st.font.name = "Microsoft YaHei"
        st._element.rPr.rFonts.set(qn("w:eastAsia"), "Microsoft YaHei")
        st.font.size = Pt(size)
        st.font.bold = True
        st.font.color.rgb = RGBColor.from_string(color)

    for sec in doc.sections:
        add_header(sec)
        add_footer(sec)

    add_title_page(doc)

    add_heading(doc, "一、执行摘要", 1)
    add_para(doc, "夜市慧盾是一套面向夜市、夜游街区、文旅商圈和基层联防场景的公共安全智能预警与秒级响应系统。项目围绕“发现更早、联动更快、处置更稳、留痕更全”构建群众端、商户端、巡防端与指挥端的协同闭环，把求助、上报、研判、派单、处置、复盘串成一条能运行、能演示、能复制的业务链。")
    add_para(doc, "项目当前的落地形态不是单点算法，而是可交付的业务系统：夜市联防信息平台负责 clue 汇聚与共享，多模态识别负责对高风险行为做初筛与复核，一键报警负责把商户和群众的紧急需求快速送达联动端。项目已形成原型界面、证书预览、夜市地图点位与指挥后台展示材料，可继续扩展为试点版、交付版和训练版。")
    add_bullets(doc, [
        "产品定位：夜市公共安全治理与联勤联动工具，而不是单纯的视频识别模型。",
        "核心优势：多源信息接入、AI 初筛 + 语义复核、处置留痕、移动端可用。",
        "商业逻辑：平台授权、硬件集成、年度服务、训练与运维构成复合收入。",
        "参赛定位：中国国际大学生创新大赛职教赛道创意组，强调可演示、可落地、可复制。",
    ])

    add_heading(doc, "二、项目背景与问题定义", 1)
    add_para(doc, "夜市与夜游街区是城市夜间消费和公共活动的高频场景，既承载人流，也承载摊位经营、交通转换、临水边界、酒精消费和临时活动。场景复杂并不等于一定高风险，但它天然更需要快速发现苗头、快速确认事实、快速派单处置。")
    add_para(doc, "调研中最突出的问题不是“没有监控”，而是“线索散、协同慢、复盘弱”。群众求助往往从电话、微信群、临时口头反馈进入系统，商户和巡防人员对同一事件掌握的信息不一致，指挥端又很难在第一时间看到统一的状态。")
    add_bullets(doc, [
        "风险类型：拥挤推挤、酒后纠纷、财物遗失、尾随骚扰、临水跌落、摊位冲突、散场拥堵。",
        "治理痛点：前端发现不稳、跨角色沟通不顺、处置进展看不清、事后材料不成链。",
        "产品目标：把“感知—研判—联动—留痕—复盘”做成标准化业务流程。",
    ])

    add_heading(doc, "三、市场调研与需求验证", 1)
    add_para(doc, "根据项目PPT中的调研样本，团队走访了多类夜市与相关管理场景，收集了消费者、商户、管理者和基层治理人员的反馈。样本重点指向两个问题：夜间安全风险感知较强，但现有工具的响应与联动能力不足。")
    t = doc.add_table(rows=5, cols=2)
    set_table_style(t)
    set_table_fixed_width(t, [2500, 6860])
    market_rows = [
        ("调研维度", "项目PPT中归纳的主要结论"),
        ("消费者", "最关注盗窃、酒后滋扰、拥挤踩踏与斗殴等问题，愿意接受更清晰的联动与提示。"),
        ("商户", "最在意联络慢、等待长、现场难叫到人，希望一键触达和可回看。"),
        ("管理侧", "更需要跨点位共享、统一态势图和处置留痕，减少人工协调成本。"),
        ("结论", "夜市安全治理有明确刚需，且适合从“试点场景+标准流程”切入。"),
    ]
    for i, row in enumerate(market_rows):
        for j, v in enumerate(row):
            c = t.cell(i, j)
            c.text = v
            set_cell_margins(c)
            set_cell_shading(c, "EAF1F8" if i == 0 else ("F8FAFC" if i % 2 == 1 else "FFFFFF"))
            for p in c.paragraphs:
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER if i == 0 or j == 0 else WD_ALIGN_PARAGRAPH.LEFT
                for r in p.runs:
                    style_run(r, size=10, bold=(i == 0))
    add_caption(doc, "表1  项目调研结论摘要（据PPT整理）")
    add_para(doc, "需求判断上，项目并不是在创造一个“新问题”，而是在解决一个长期存在但缺少统一工具的治理环节。对于学校创新创业项目而言，这种需求清晰、边界明确、流程能跑通的题目更适合形成可展示、可答辩的作品。")

    add_heading(doc, "四、产品与解决方案", 1)
    add_para(doc, "夜市慧盾的产品形态分为三层：一层是面向群众和商户的接入层，一层是面向巡防与指挥的业务层，一层是面向数据与模型的能力层。三层共同支撑“夜市风险智能预警、联勤联动、秒级响应”的目标。")
    add_numbered(doc, [
        "夜市联防信息平台：汇聚商户上报、群众求助、巡防记录和处置结果，形成统一事件库。",
        "多模态行为识别：对人群聚集、异常徘徊、冲突接近、热力异常等进行初筛与辅助复核。",
        "一键报警与联动派单：商户或群众在移动端即可触发联动，系统将任务送到值守端。",
        "指挥中心与可视化态势：通过地图、队列、处置卡和时间线展示现场情况。",
    ])
    add_image(doc, BASE / "ppt_analysis" / "style_assets" / "web_command_screenshot.png", 6.5, "图1  夜市防护指挥中心与运营控制台原型")
    add_para(doc, "产品设计上，最重要的不是把页面做复杂，而是把“看见问题”和“处理问题”之间的路径缩短。夜市场景里，操作越少、口径越统一、反馈越及时，系统就越容易被真正使用。")

    add_heading(doc, "五、业务流程与用户路径", 1)
    flow = doc.add_table(rows=1, cols=5)
    set_table_style(flow)
    set_table_fixed_width(flow, [1660, 1660, 1660, 1660, 1660])
    headers = ["发现", "确认", "派单", "处置", "留痕"]
    for i, h in enumerate(headers):
        c = flow.cell(0, i)
        c.text = h
        set_cell_shading(c, "DCE6F2")
        set_cell_margins(c)
        for p in c.paragraphs:
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            for r in p.runs:
                style_run(r, size=10.5, bold=True)
    row = flow.add_row().cells
    vals = [
        "群众、商户、巡防或算法初筛发现风险",
        "AI 初筛 + 人工复核 + 事件分级",
        "系统把任务送给最近的处置力量",
        "到场、沟通、记录、反馈与回传",
        "形成证据链、台账、复盘与训练素材",
    ]
    for i, v in enumerate(vals):
        row[i].text = v
        set_cell_margins(row[i])
        for p in row[i].paragraphs:
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            for r in p.runs:
                style_run(r, size=9.5)
    add_caption(doc, "表2  夜市慧盾标准处置链路")
    add_para(doc, "这个链路的关键价值在于，任何一次求助或告警都不再是“发出去就结束”，而是有状态、有时点、有反馈的业务事件。对夜市商户来说，能看到结果；对管理者来说，能看到过程；对后续复盘来说，能看到证据。")

    add_heading(doc, "六、核心技术与创新点", 1)
    add_para(doc, "项目的技术路线采用“边缘初筛 + 云端复核 + 业务编排 + 留痕归档”的组合方式。PPT中展示的技术重点包括 YOLOv8 初筛、Qwen-VL 视觉语义复核、边缘计算、低时延传输和多模态态势分析。")
    add_bullets(doc, [
        "技术创新1：多源数据融合，不把单一摄像头识别当作全部结论，而是把现场信息、处置状态和历史事件一起纳入判断。",
        "技术创新2：初筛与复核分层，先快速发现疑似风险，再用语义模型做二次确认，降低误报对夜市现场的干扰。",
        "技术创新3：联动闭环，把一键报警、工单派发、巡防反馈和结果回填统一到一张事件卡里。",
        "技术创新4：可复制部署，既能作为单点试点，也能扩展为多个夜市联防网络。",
    ])
    add_image(doc, BASE / "ppt_analysis" / "style_assets" / "prototype_results_screenshot.png", 6.5, "图2  指挥后台与事件处理原型界面")
    add_para(doc, "需要明确的是，项目中凡涉及无人机、机器人犬、视频复核和联动派单的能力，都属于授权场景下的治理辅助工具，不直接替代人工判断，也不替代法定程序。这样写进计划书，更利于通过学校、指导老师和评审的合规检查。")

    add_heading(doc, "七、知识产权与成果基础", 1)
    add_para(doc, "PPT中列出了多项软件著作权预览材料，覆盖集群调度、数据集成、智能巡检和测试交互等方向。对外呈现时，建议将这些内容写成“已有成果沉淀与持续申请中”的表述，并在正式申报附件中补齐证书编号、权属关系和当前状态。")
    add_image(doc, BASE / "ppt_analysis" / "selected_certs" / "主放三项软著预览.jpg", 6.5, "图3  软件著作权预览材料")
    add_para(doc, "这部分的写法重点不是堆证书，而是说明团队不是从零空想，而是已有工程化积累。评审通常更愿意看到“真实做过”的痕迹。")

    doc.add_page_break()
    add_heading(doc, "八、市场规模与目标客户", 1)
    add_para(doc, "项目的客户不是普通消费者，而是更接近政府治理、公共安全、文旅运营、夜市管理、安保服务和基层联防部门。也就是说，买单方更看重功能可靠性、部署成本、维护成本和实际可用性。")
    add_three_col_table(doc, [
        ("目标客户", "典型场景", "核心诉求"),
        ("政府/街道", "夜市治理、商圈治理、活动安保", "统一态势、联动派单、责任留痕"),
        ("公安/巡防", "夜间值守、联勤响应、事件复盘", "快速确认、处置闭环、证据保全"),
        ("文旅/商管", "夜游街区、景区夜市、消费集聚区", "秩序提升、游客体验、运营口碑"),
        ("安保公司", "项目外包、驻场运维、巡查服务", "工具可用、培训可交付、服务可计费"),
    ], [2000, 3960, 3400])
    add_caption(doc, "表3  目标客户与需求映射")
    add_para(doc, "按照项目PPT的表达，夜市消费和夜间治理需求都在增长，但真正可落地的机会并不在“全国都卖”，而是在可试点、可展示、可复制的场景里先跑出样板。")

    add_heading(doc, "九、竞品对比与差异化", 1)
    comp = doc.add_table(rows=5, cols=4)
    set_table_style(comp)
    set_table_fixed_width(comp, [1960, 2260, 2200, 2940])
    comp_rows = [
        ("方案", "价格区间", "适配场景", "特点"),
        ("宇视安防", "52–76万元", "常规安防项目", "功能完整，部署预算较高"),
        ("海康平台", "80–110万元", "综合安防平台", "品牌强，但试点成本高"),
        ("大华物联", "72–102万元", "物联与视频治理", "成熟稳定，定制空间相对有限"),
        ("夜市慧盾", "15万元", "夜市治理、文旅夜游、基层联防", "轻量试点、移动补盲、AI 研判、派单留证闭环"),
    ]
    for i, row in enumerate(comp_rows):
        for j, value in enumerate(row):
            c = comp.cell(i, j)
            c.text = value
            set_cell_margins(c)
            set_cell_shading(c, "DCE6F2" if i == 0 else ("F8FAFC" if i % 2 == 1 else "FFFFFF"))
            for p in c.paragraphs:
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER if j != 3 else WD_ALIGN_PARAGRAPH.LEFT
                for r in p.runs:
                    style_run(r, size=9.5, bold=(i == 0))
    add_caption(doc, "表4  竞品与本项目对比（据PPT价格资料整理）")
    add_para(doc, "差异化并不只是“价格低”，而是目标更聚焦、部署更轻量、流程更顺手。对于早期试点来说，这往往比“功能很多但太重”更重要。")

    add_heading(doc, "十、商业模式与定价策略", 1)
    add_para(doc, "项目的收入结构建议采用“平台授权 + 硬件集成 + 年度服务 + 训练支持”四段式组合。这样既能覆盖一次性交付，也能覆盖持续服务。")
    add_three_col_table(doc, [
        ("收入项", "定价口径", "说明"),
        ("平台永久授权", "15万元", "一次性授权，适合试点和首批客户。"),
        ("硬件集成", "3万元", "适配现场摄像、联动和终端接入。"),
        ("年度租赁/服务", "5万元/年", "适合持续试运行、升级和响应服务。"),
        ("培训与运维", "按项目计费", "面向安保、巡防和管理团队的训练支持。"),
    ], [2300, 1700, 5360])
    add_caption(doc, "表5  商业化定价结构（据PPT口径整理）")
    add_para(doc, "这种结构的好处是既能做项目制收入，也能为后续订阅化、服务化和复制化留出空间。")

    doc.add_page_break()
    add_heading(doc, "十一、财务测算与资金计划", 1)
    add_para(doc, "PPT给出的财务模型显示，项目在 2027 至 2030 年进入逐步放量阶段。为了保留参赛材料的一致性，本计划书沿用该测算口径，同时建议在正式提交前由指导老师或财务老师对净利润口径做一次统一校验。")
    finance1 = doc.add_table(rows=5, cols=2)
    set_table_style(finance1)
    set_table_fixed_width(finance1, [2500, 6860])
    set_repeat_table_header(finance1.rows[0])
    finance_assumptions = [
        ("测算项", "口径"),
        ("收入周期", "2027—2030 年，按试点推广、区域复制和服务化推进拆分。"),
        ("核心价格锚点", "平台授权 15 万元、硬件集成 3 万元、年度服务 5 万元/年。"),
        ("业务结构", "平台销售、硬件集成、租赁/服务、培训支持四类收入并行。"),
        ("成本控制", "研发、市场、运营、管理分层统计，便于后续核验。"),
    ]
    for i, row in enumerate(finance_assumptions):
        for j, value in enumerate(row):
            c = finance1.cell(i, j)
            c.text = value
            set_cell_margins(c)
            set_cell_shading(c, "DCE6F2" if i == 0 else ("F8FAFC" if i % 2 == 1 else "FFFFFF"))
            for p in c.paragraphs:
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER if i == 0 or j == 0 else WD_ALIGN_PARAGRAPH.LEFT
                for r in p.runs:
                    style_run(r, size=9.5, bold=(i == 0 or j == 0))
    add_caption(doc, "表6  财务测算关键假设")

    finance2 = doc.add_table(rows=5, cols=6)
    set_table_style(finance2)
    set_table_fixed_width(finance2, [1300, 1800, 1700, 1700, 1700, 1560])
    set_repeat_table_header(finance2.rows[0])
    finance_revenue = [
        ("年度", "平台销售", "硬件集成", "年度服务", "培训支持", "合计"),
        ("2027", "20万元", "8万元", "15万元", "7万元", "50万元"),
        ("2028", "40万元", "15万元", "55万元", "23万元", "133万元"),
        ("2029", "70万元", "25万元", "90万元", "40万元", "225万元"),
        ("2030", "100万元", "35万元", "130万元", "55万元", "320万元"),
    ]
    for i, row in enumerate(finance_revenue):
        for j, value in enumerate(row):
            c = finance2.cell(i, j)
            c.text = value
            set_cell_margins(c)
            set_cell_shading(c, "DCE6F2" if i == 0 else ("F8FAFC" if i % 2 == 1 else "FFFFFF"))
            for p in c.paragraphs:
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                for r in p.runs:
                    style_run(r, size=9.0, bold=(i == 0))
    add_caption(doc, "表7  2027—2030 年收入结构拆分")

    finance3 = doc.add_table(rows=5, cols=6)
    set_table_style(finance3)
    set_table_fixed_width(finance3, [1300, 1700, 1700, 1700, 1700, 1660])
    set_repeat_table_header(finance3.rows[0])
    finance_cost = [
        ("年度", "研发", "市场", "运营", "管理", "合计"),
        ("2027", "18万元", "10万元", "8万元", "6万元", "42万元"),
        ("2028", "24万元", "16万元", "14万元", "14万元", "68万元"),
        ("2029", "28万元", "22万元", "20万元", "21万元", "91万元"),
        ("2030", "32万元", "26万元", "28万元", "31万元", "117万元"),
    ]
    for i, row in enumerate(finance_cost):
        for j, value in enumerate(row):
            c = finance3.cell(i, j)
            c.text = value
            set_cell_margins(c)
            set_cell_shading(c, "DCE6F2" if i == 0 else ("F8FAFC" if i % 2 == 1 else "FFFFFF"))
            for p in c.paragraphs:
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                for r in p.runs:
                    style_run(r, size=9.0, bold=(i == 0))
    add_caption(doc, "表8  2027—2030 年成本结构拆分")

    finance4 = doc.add_table(rows=5, cols=4)
    set_table_style(finance4)
    set_table_fixed_width(finance4, [1700, 1700, 1700, 3800])
    set_repeat_table_header(finance4.rows[0])
    finance_use = [
        ("资金用途", "金额", "占比", "说明"),
        ("研发", "49万元", "35%", "算法、前后端、指挥联动与测试迭代"),
        ("市场", "35万元", "25%", "试点拓展、样板建设、路演传播"),
        ("团队", "28万元", "20%", "核心成员支持、协作与交付准备"),
        ("预备金", "28万元", "20%", "采购波动、应急支出与补充预算"),
    ]
    for i, row in enumerate(finance_use):
        for j, value in enumerate(row):
            c = finance4.cell(i, j)
            c.text = value
            set_cell_margins(c)
            set_cell_shading(c, "DCE6F2" if i == 0 else ("F8FAFC" if i % 2 == 1 else "FFFFFF"))
            for p in c.paragraphs:
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER if j < 3 else WD_ALIGN_PARAGRAPH.LEFT
                for r in p.runs:
                    style_run(r, size=9.0, bold=(i == 0))
    add_caption(doc, "表9  融资用途与预算分配")

    finance5 = doc.add_table(rows=4, cols=4)
    set_table_style(finance5)
    set_table_fixed_width(finance5, [1700, 2050, 2050, 3050])
    set_repeat_table_header(finance5.rows[0])
    finance_sens = [
        ("情景", "2030 年收入", "2030 年净利润", "判断"),
        ("保守", "280万元", "约60万元", "扩张放缓但仍可维持正向现金流"),
        ("基准", "320万元", "95.75万元", "与PPT主模型一致"),
        ("乐观", "360万元", "约125万元", "复制速度更快，服务收入上升"),
    ]
    for i, row in enumerate(finance_sens):
        for j, value in enumerate(row):
            c = finance5.cell(i, j)
            c.text = value
            set_cell_margins(c)
            set_cell_shading(c, "DCE6F2" if i == 0 else ("F8FAFC" if i % 2 == 1 else "FFFFFF"))
            for p in c.paragraphs:
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER if j < 3 else WD_ALIGN_PARAGRAPH.LEFT
                for r in p.runs:
                    style_run(r, size=9.0, bold=(i == 0))
    add_caption(doc, "表10  敏感性分析")

    finance6 = doc.add_table(rows=5, cols=4)
    set_table_style(finance6)
    set_table_fixed_width(finance6, [1400, 1800, 1800, 3920])
    set_repeat_table_header(finance6.rows[0])
    finance_summary = [
        ("年度", "收入", "成本", "净利润"),
        ("2027", "50万元", "42万元", "-57.67万元"),
        ("2028", "133万元", "68万元", "1.26万元"),
        ("2029", "225万元", "91万元", "33.60万元"),
        ("2030", "320万元", "117万元", "95.75万元"),
    ]
    for i, row in enumerate(finance_summary):
        for j, value in enumerate(row):
            c = finance6.cell(i, j)
            c.text = value
            set_cell_margins(c)
            set_cell_shading(c, "DCE6F2" if i == 0 else ("F8FAFC" if i % 2 == 1 else "FFFFFF"))
            for p in c.paragraphs:
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                for r in p.runs:
                    style_run(r, size=9.5, bold=(i == 0))
    add_caption(doc, "表11  2027—2030 年财务总表（据PPT测算口径整理）")
    add_para(doc, "财务写法上，最规范的方式通常是先给假设，再给收入拆分，再给成本拆分，最后回到总表。这样评审既能看懂数据从哪里来，也能看懂为什么会形成这个利润结果。")
    add_bullets(doc, [
        "融资目标：150万元，主要用于研发、市场开拓、团队建设与储备。",
        "估值结构：按PPT测算为投前 793 万、投后 933 万，对应出让 15% 左右权益。",
        "财务提示：正式申报前建议补一版口径说明，避免净利润与累计净利润的统计口径冲突。",
    ])

    add_heading(doc, "十二、实施路径与里程碑", 1)
    road = doc.add_table(rows=1, cols=4)
    set_table_style(road)
    set_table_fixed_width(road, [1620, 2860, 2860, 2020])
    for i, h in enumerate(["阶段", "时间", "重点工作", "结果"]):
        c = road.cell(0, i)
        c.text = h
        set_cell_shading(c, "DCE6F2")
        set_cell_margins(c)
        for p in c.paragraphs:
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            for r in p.runs:
                style_run(r, size=10, bold=True)
    phase_rows = [
        ("启动期", "2025.10", "团队组建、方向定稿、角色分工", "项目成型"),
        ("验证期", "2025.12", "调研、框架规划、原型设计", "需求明确"),
        ("开发期", "2026.01—2026.06", "核心模块开发与联调测试", "可演示原型"),
        ("试运行期", "2026.07—2026.08", "联合测试、场景试点、数据回收", "试点反馈"),
        ("扩展期", "2027 起", "完善模型、增加场景、推进复制", "商业化扩展"),
    ]
    for row in phase_rows:
        cells = road.add_row().cells
        for i, v in enumerate(row):
            cells[i].text = v
            set_cell_margins(cells[i])
            set_cell_shading(cells[i], "FFFFFF")
            for p in cells[i].paragraphs:
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                for r in p.runs:
                    style_run(r, size=9.5)
    add_caption(doc, "表12  项目进展与里程碑（据PPT整理）")
    add_para(doc, "这个时间表的价值在于，它已经具备“从想法走到试点”的完整链条。评审通常更认可这种有节奏、有阶段、有反馈的推进方式。")

    add_heading(doc, "十三、团队与协作机制", 1)
    team = doc.add_table(rows=1, cols=3)
    set_table_style(team)
    set_table_fixed_width(team, [1960, 2300, 5100])
    for i, h in enumerate(["成员", "角色", "主要负责内容"]):
        c = team.cell(0, i)
        c.text = h
        set_cell_shading(c, "DCE6F2")
        set_cell_margins(c)
        for p in c.paragraphs:
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            for r in p.runs:
                style_run(r, size=10, bold=True)
    team_rows = [
        ("徐俊", "项目负责人", "总体推进、系统实现、成果统筹与展示答辩"),
        ("秦奕", "执行协调", "任务组织、进度跟踪、答辩协同"),
        ("刘元清", "材料与视觉", "PPT、图文材料、叙事整理"),
        ("陈雨诗", "交互与视频", "用户交互、视频表达、呈现优化"),
        ("李瑶", "市场与推广", "对外沟通、宣传、现场推广"),
        ("谢美仪", "AI 分析", "识别、分析与模型辅助"),
        ("蒋凯", "运营与财务", "运营协同、财务整理、项目管理"),
    ]
    for row in team_rows:
        cells = team.add_row().cells
        for i, v in enumerate(row):
            cells[i].text = v
            set_cell_margins(cells[i])
            for p in cells[i].paragraphs:
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER if i < 2 else WD_ALIGN_PARAGRAPH.LEFT
                for r in p.runs:
                    style_run(r, size=9.3)
    add_caption(doc, "表13  团队分工概览")
    add_para(doc, "团队最重要的不是人多，而是每个人都知道自己负责哪一段。这样项目不会在答辩前临时“找人补图、找人补词、找人补功能”。")

    add_heading(doc, "十四、合作与试点基础", 1)
    add_para(doc, "PPT中展示了多个合作与试运行场景，说明团队已经在贴近真实治理环境中寻找验证点。对计划书来说，这一部分建议写成“已有试点沟通和合作场景储备”，避免把尚未签署的合作写成既成承诺。")
    add_bullets(doc, [
        "合作场景：夜市、商圈、街道治理、基层警务与值守联动。",
        "试点价值：快速验证告警链路、处置效率和界面可用性。",
        "扩展路径：从单点夜市到多点联防，再到区域复制。",
    ])

    add_heading(doc, "十五、风险、合规与应对", 1)
    add_bullets(doc, [
        "数据合规风险：涉及视频、位置与事件信息时，需按权限、范围和保存期限进行管理。",
        "误报与漏报风险：通过分层识别、人工复核和参数迭代降低干扰。",
        "现场执行风险：对联动流程做角色说明，避免不同部门职责混乱。",
        "商业化风险：先做试点、样板和可展示案例，再逐步扩张，不急于铺开。",
        "品牌表达风险：统一使用“夜市慧盾”主品牌，保持材料口径一致。",
    ])
    add_para(doc, "项目对外表达时建议坚持一个原则：强调治理辅助和流程协同，不夸大为自动化执法，也不把试验中的指标包装成既成事实。这样更稳，也更容易过评审。")

    add_heading(doc, "十六、社会价值与应用前景", 1)
    add_para(doc, "夜市慧盾的社会价值主要体现在三个层面：一是让夜间消费更安全，二是让基层治理更省力，三是让学校项目更容易形成可复制的职业教育成果。")
    add_bullets(doc, [
        "对群众：求助入口更直接，风险反馈更及时。",
        "对商户：纠纷和异常更容易被发现，沟通更顺畅。",
        "对治理方：有统一态势、有过程留痕、有复盘素材。",
        "对学校：能形成项目、作品、案例、成果和实训材料。",
    ])

    add_heading(doc, "十七、结论", 1)
    add_para(doc, "总体来看，夜市慧盾是一项适合中国国际大学生创新大赛职教赛道的项目：场景明确、痛点真实、技术可解释、材料可展示、商业路径也能讲清楚。只要把试点、证据链、合规说明和财务口径再补扎实，这份计划书就可以直接用于申报、路演和后续迭代。")

    add_heading(doc, "附录A  资料来源与提交前核验清单", 1)
    add_bullets(doc, [
        "资料来源1：9.2夜市慧盾PPT（晚）.pptx 提取文本与原始页面。",
        "资料来源2：项目原型界面截图与证书预览图。",
        "资料来源3：既有项目资料中与夜市治理、指挥后台、前端原型相关的内容。",
        "提交前核验：补齐证书编号、合作证明、试点点位说明、财务口径说明、团队签名页。",
    ])

    add_heading(doc, "附录B  图像与展示材料清单", 1)
    add_bullets(doc, [
        "图1 夜市防护指挥中心与运营控制台原型。",
        "图2 指挥后台与事件处理原型界面。",
        "图3 软件著作权预览材料。",
    ])

    doc.save(DOCX_PATH)
    print(DOCX_PATH)


if __name__ == "__main__":
    build()
