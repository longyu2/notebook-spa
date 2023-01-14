
<template>
    <div class="MoveToFolder">

        <div class="header">
            <span>移动到文件夹</span>
            <button class="close-btn" @click="close">×</button>
        </div>
        <hr>


      <ul>
        <a href="#"><li class="head-li" @click="MoveToFolder({folder_id:-1,folder_name:'未分类'})">
            <img src="@/assets/return.svg" alt="">
           <span>移出文件夹</span> 
        </li></a>
        <a href="#"><li v-for = 'item in folderList' @click="MoveToFolder(item)" key="item">
          <img src="@/assets/folder.svg" alt="">
          <span>  {{ item.folder_name }}</span>
        </li>
        </a>
      </ul>
    </div>
</template>

<script>
import axios from 'axios'
import { toRaw } from 'vue'
export default{
    props:['server_url','folderList','check_list'],
    data() {
        return {
            check_id_list : this.check_list
        }
    },


    methods:{
        // 根据获取到的 目标文件夹id 和 已经选中的 文章的id。进行添加
        MoveToFolder:function(item){
            console.log(this.server_url)
            console.log(item.folder_id)

            
            console.log(toRaw(this.check_id_list))

            let id_list = toRaw(this.check_id_list)

            let jsonObj = {
                folder_id:item.folder_id,
                check_id_list :id_list
            }

            axios.post(`${this.server_url}/FolderAddArticle`,jsonObj).then((results)=>{
                console.log(results)
            })

        },
        close:function(){
            this.$emit('someEvent')
        }

    },
    created:function(){
        
    }
}

</script>


<style lang="scss" scoped>
.MoveToFolder{
    width: 470px;
    height: auto;
    max-height: 55vh;
    overflow: auto;
    padding-bottom: 100px;
    z-index: 3;
    position: absolute;
    margin: auto;
    margin-top: 160px;
    background-color: #FFF;
    border-radius: 10px;
    border: 2px solid gainsboro;
    box-shadow: 3px 3px 7px   gray;
    .header{
        display: flex;
        justify-content: space-between;
        span{
            font-size: 20px;
            font-weight: 500;
            margin: 10px 20px;
            font-family: 微软雅黑;
        }
    }
    .close-btn{
        background:0%;
        border: 0px;
        font-size: 30px;
        color: grey;
        font-family: 微软雅黑;
        margin:0px 10px;
    }
    .close-btn:hover{
        color:#000;
    }

    ul{
        margin-left: 10px;
        list-style: none;
        
        .head-li{
            height: 50px;
            display: flex;
            justify-content: flex-start;
            align-items: center;
            margin-left:12px;
            img{
                width:28px;
            }
            span{
                font-size:large ;
                margin-left: 30px;
            }
        }
        a{
            color: #111;
            font-size: large;

            text-decoration: none;
            li{
                height: 50px;
                display: flex;
                justify-content: flex-start;
                align-items: center;
                img{
                    width: 50px;
                }
                span{
                    margin-left: 20px;
                }
                
            }
        }
    };
}

</style>